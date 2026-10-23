# Falch Vaskebyrå — utviklernotater

Nettsiden til Falch Vaskebyrå — vaskegrenen til et enkeltpersonforetak i
Trondheim som gjør mer enn bare vask. Vaskebyrået tar flyttevask, nedvask,
vindusvask, trappevask og fast renhold.

Siden er en bevisst 90-talls-pastisj: rullende marquee, Comic Sans, ridge-borders,
besøksteller og en gjørmeflekk som blir vasket bort når du scroller til bunnen.
Det er ikke uhell, det er stilvalget.

## Kjøre lokalt

Selve siden er rene statiske filer uten bygg. Åpne `index.html` direkte, eller
kjør dev-serveren om du også vil ha den ekte besøkstelleren på `/api/teller`:

```sh
uv run python teller/dev.py
# → http://localhost:8000
```

Åpner du `index.html` som fil på disk finnes det ingen teller å spørre, og
siden faller tilbake til den gamle fleip-telleren som teller feil med vilje.

## Struktur

```
index.html               markup
css/stil.css             all styling
js/skjema.js             besøksteller, hopp-til-skjema, kontaktskjema (mailto)
js/vask.js               gjørmesekvensen nederst på siden
assets/                  bobler.svg, flis.webp, vasker.webp
teller/teller.py         telletjenesten (stdlib + sqlite, ingen avhengigheter)
teller/dev.py            lokal server: statiske filer + teller på samme port
deploy/falch-vaskebyra-teller.service  systemd user unit for telleren (rpi5)
deploy/falch-vaskebyra-site.service    systemd system unit for Caddy (rpi5)
deploy/falch-vaskebyra.Caddyfile       Caddy-konfig for rpi5
deploy/install-system.sh               sudo-steget: Caddy, site-unit, cloudflared
deploy/cf_ingress.py                   legger ingress-regelen inn i cloudflared-configen
```

## Besøkstelleren

`teller/teller.py` er ett endepunkt, `GET /api/teller`, som svarer
`{"n": <tall>, "ny": <bool>}`.

**Hvorfor ikke bare en tekstfil:** to samtidige treff ville lest samme tall,
lagt til én hver og skrevet tilbake samme resultat — den ene opptellingen
forsvinner. SQLite med `BEGIN IMMEDIATE` serialiserer skrivere, så det kan ikke
skje. Testet med 200 samtidige unike besøkende: nøyaktig 200 opptellinger.

**Teller ikke hver refresh.** Én opptelling per besøkende per døgn, avgjort av
en `INSERT OR IGNORE` mot en dedup-tabell. Åpenbare boter (`bot`, `crawl`,
`curl`, `headless` osv. i user-agent) får tallet, men teller ikke.

**Startverdien (42) settes bare når databasen opprettes.** `FALCH_START` bruker
`INSERT OR IGNORE`, så å endre miljøvariabelen på en eksisterende database gjør
ingenting. Vil du justere tallet i ettertid:
`sqlite3 teller/teller.db 'UPDATE teller SET n = 1337 WHERE id = 1'`.

**Personvern:** IP-adresser lagres aldri, heller ikke i loggen. Nøkkelen er en
trunkert SHA-256 av `salt + IP + user-agent + dato`, der saltet genereres
tilfeldig ved første oppstart og ligger i databasen. Dedup-rader slettes etter
40 dager.

### Sette det opp på rpi5

Målet er `https://falch-vaskebyra.afrasum.dev`, via den eksisterende
cloudflared-tunnelen `rpi` (`0ebea07c-…`) som allerede kjører
solalaserklinikk og landslagsdrakt. Samme mønster som de to: en egen Caddy-
instans per side, med en dedikert Caddyfile og system-unit.

Portvalg: **8007** til telletjenesten, **8008** til Caddy. 8001, 8005 og 8006
er opptatt av henholdsvis skinclinic, neurochip og landslagsdrakt.

**0 — publiser repoet** (lokalt, én gang):

```sh
cd ~/Projects/falch-vaskebyra
git init && git add -A && git commit -m "Falch Vaskebyrå: nettside, besøksteller, deploy"
git branch -M main
git remote add origin git@github.com:Afrasum/falch-vaskebyra.git
git push -u origin main
```

**1 — hent koden på Pi-en** (som `afras`, ingen sudo). SSH-nøkkelen på Pi-en er
allerede autentisert mot GitHub som `Afrasum`:

```sh
ssh rpi5 'git clone git@github.com:Afrasum/falch-vaskebyra.git ~/projects/falch-vaskebyra'
```

Senere oppdateringer: `ssh rpi5 'git -C ~/projects/falch-vaskebyra pull'`.
Caddy serverer fra arbeidskatalogen, så en `pull` er nok for rene
frontend-endringer — ingen restart nødvendig.

**2 — telletjenesten som bruker-unit** (ingen sudo; linger er på for `afras`,
så den starter ved boot):

```sh
ssh rpi5 '
  install -Dm644 ~/projects/falch-vaskebyra/deploy/falch-vaskebyra-teller.service \
    ~/.config/systemd/user/falch-vaskebyra-teller.service
  export XDG_RUNTIME_DIR=/run/user/$(id -u)
  systemctl --user daemon-reload
  systemctl --user enable --now falch-vaskebyra-teller.service
  curl -s -A "Netscape/4.0" localhost:8007/api/teller
'
```

Bruk en user-agent uten `curl` i navnet i den siste sjekken — bot-filteret
utelater ellers kallet fra opptellingen, og svaret `{"n": 42, "ny": false}` ser
ut som en feil selv om alt virker.

Site-Caddyen er en **system**-unit (starter ved boot) mens telleren er en
**bruker**-unit (starter når linger-sesjonen er oppe). Rekkefølgen er ikke
garantert, så `/api/teller` kan gi 502 i noen sekunder etter en omstart. Da
faller siden tilbake til fleip-telleren, som er riktig oppførsel — en 502 der
i loggen betyr ikke at noe er ødelagt.

**3 — Caddy og cloudflared** (krever sudo, så den må du kjøre selv):

```sh
ssh -t rpi5 "sudo sh ~/projects/falch-vaskebyra/deploy/install-system.sh"
```

Skriptet legger inn Caddyfile og site-unit, validerer Caddy-konfigurasjonen,
starter `falch-vaskebyra-site.service`, og legger ingress-regelen inn i
`/etc/cloudflared/config.yml` rett før catch-all. Configen sikkerhetskopieres
først, valideres med `cloudflared --config … tunnel ingress validate`, og
rulles tilbake automatisk hvis valideringen feiler. Kjøres den to ganger gjør
den ingenting andre gang.

**4 — DNS** (som `afras`, uten sudo — `~/.cloudflared/cert.pem` finnes):

```sh
ssh rpi5 'cloudflared tunnel route dns rpi falch-vaskebyra.afrasum.dev'
```

## Noter til den som skal endre noe

- **`<marquee>` er med vilje.** Elementet er deprecated, men det er selve
  poenget med stilen, og det oppfører seg annerledes enn en CSS-animasjon:
  `@media (prefers-reduced-motion:reduce)` slår av alle animasjoner og klipper
  marqueen med `overflow:hidden` i stedet. En CSS-basert erstatning ville blitt
  stående som statisk overflytende tekst i den tilstanden.
- **Kontaktskjemaet har `novalidate`.** Valideringen ligger i JS slik at
  feilmeldingen skrives inn i `#kvittering` på siden, i stedet for at nettleseren
  spretter opp sin egen boble. Legger du på `required` overtar nettleseren.
  Feltene ligger nå i et ekte `<form>`, så Enter i et felt sender skjemaet —
  det er den eneste oppførselsendringen fra den opprinnelige enkeltfila.
- **Prislisten har ingen `<tbody>`.** Stripingen er `tr:nth-child(even) td`, og
  header-raden teller som barn nr. 1. Pakker du radene i `<tbody>` bytter
  stripene annenhver rad. Tabellen under «Om oss» har `<th>` i hver rad og
  ingen header-rad — der ville en `<thead>` vært direkte feil.
- **Gjørmesekvensen** utløses automatisk første gang `#bunnpunkt` blir synlig
  (IntersectionObserver, med scroll-fallback), og manuelt via 🪣-lenken i footeren.
  Den hopper helt over ved `prefers-reduced-motion`. `window.falchVask()` kjører
  den fra konsollet.
- **«Godkjent uten ansatte».** Arbeidstilsynets renholdsregister oppgir status
  *Lovlig* og *Godkjent uten ansatte* for org.nr 930 912 727 (sjekket
  2026-10-23, etter at HMS-kortet kom). Det betyr at bare eieren kan gjøre
  arbeidet, med synlig HMS-kort. Får foretaket ansatte, gjelder flere krav —
  ikke skriv noe annet på siden før registeret sier det. Sjekk
  <https://www.arbeidstilsynet.no/renholdsvirksomhet/930912727>.
- **Registrert adresse er en annen enn driftsstedet.** Brreg har
  Ytrebygdsvegen 66A, 5252 Søreidgrend (Bergen) som forretningsadresse, mens
  siden beskriver oppdrag i Trondheim. Det er lov å ha begge deler, men ikke bli
  overrasket når noen slår opp foretaket.
- **Foretaket er ikke MVA-registrert** (per Brreg). Formuleringen «Mva. kommer
  eventuelt i tillegg» dekker det, men du kan ikke fakturere mva. før
  registrering er på plass.

## Kontakt

401 66 715 · afras@hotmail.no · Org.nr 930 912 727
