#!/usr/bin/env python3
"""Besøksteller for Falch Vaskebyrå.

Ett endepunkt, GET /api/teller, som teller opp én gang per besøkende per døgn
og svarer {"n": <tall>}. Ingen avhengigheter utenfor standardbiblioteket.

Personvern: IP-adresser lagres aldri. Vi lagrer en trunkert SHA-256 av
(hemmelig salt + IP + user-agent + dato). Saltet genereres tilfeldig ved
første oppstart og ligger i databasen, så hashene kan ikke reverseres til
IP-er selv om databasefila kommer på avveie. Radene slettes etter 40 dager.
"""

import hashlib
import json
import os
import re
import secrets
import sqlite3
import sys
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HER = os.path.dirname(os.path.abspath(__file__))
DB = os.environ.get("FALCH_DB", os.path.join(HER, "teller.db"))
PORT = int(os.environ.get("FALCH_PORT", "8007"))
# START gjelder kun når databasen opprettes. Endrer du den senere skjer ingenting;
# da må du oppdatere raden direkte: UPDATE teller SET n = <tall> WHERE id = 1;
START = int(os.environ.get("FALCH_START", "42"))
BEHOLD_DAGER = 40

BOT = re.compile(r"bot|crawl|spider|slurp|curl|wget|headless|monitor|preview|fetch",
                 re.IGNORECASE)


def kobling():
    c = sqlite3.connect(DB, timeout=10, isolation_level=None)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA busy_timeout=5000")
    return c


def klargjor():
    with kobling() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS teller (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                n  INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS besok (
                nokkel TEXT PRIMARY KEY,
                dag    TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS besok_dag ON besok(dag);
            CREATE TABLE IF NOT EXISTS oppsett (
                nokkel TEXT PRIMARY KEY,
                verdi  TEXT NOT NULL
            );
            """
        )
        c.execute("INSERT OR IGNORE INTO teller (id, n) VALUES (1, ?)", (START,))
        c.execute("INSERT OR IGNORE INTO oppsett (nokkel, verdi) VALUES ('salt', ?)",
                  (secrets.token_hex(32),))


def salt():
    with kobling() as c:
        return c.execute("SELECT verdi FROM oppsett WHERE nokkel = 'salt'").fetchone()[0]


SALT = None  # settes i main()


def klient_ip(headere, peer):
    """Finn den ekte besøkendes IP bak Cloudflare-tunnel og Caddy.

    Bak cloudflared + Caddy blir X-Forwarded-For satt til ::1 — Caddy ser bare
    tunnelen på loopback, ikke den som faktisk surfer. Cloudflare sender den
    ekte adressen i CF-Connecting-IP, så den har forrang. Uten den ville alle
    eksterne besøkende med samme user-agent hashet til samme nøkkel og telt
    som én person.

    Verdien brukes kun som hash-input, aldri lagret eller logget. Headeren er
    i prinsippet forfalskbar, men origin er bare tilgjengelig via loopback og
    tunnelen, så det krever allerede tilgang til maskinen.
    """
    cf = (headere.get("CF-Connecting-IP") or "").strip()
    if cf:
        return cf
    xff = (headere.get("X-Forwarded-For") or "").split(",")[0].strip()
    if xff and xff not in ("::1", "127.0.0.1"):
        return xff
    return peer


def nokkel(ip, ua, dag):
    raw = f"{SALT}|{ip}|{ua}|{dag}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def registrer(ip, ua, tell=True):
    """Teller opp hvis dette er dagens første besøk fra denne besøkende.

    Returnerer den gjeldende totalen uansett.
    """
    dag = date.today().isoformat()
    with kobling() as c:
        c.execute("BEGIN IMMEDIATE")            # serialiserer samtidige skrivere
        try:
            ny = False
            if tell:
                cur = c.execute(
                    "INSERT OR IGNORE INTO besok (nokkel, dag) VALUES (?, ?)",
                    (nokkel(ip, ua, dag), dag),
                )
                ny = cur.rowcount == 1
                if ny:
                    c.execute("UPDATE teller SET n = n + 1 WHERE id = 1")
                    c.execute("DELETE FROM besok WHERE dag < ?",
                              ((date.today() - timedelta(days=BEHOLD_DAGER)).isoformat(),))
            n = c.execute("SELECT n FROM teller WHERE id = 1").fetchone()[0]
            c.execute("COMMIT")
            return n, ny
        except Exception:
            c.execute("ROLLBACK")
            raise


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "FalchTeller/1.0"

    def log_message(self, fmt, *a):            # ingen IP-er i loggen
        sys.stderr.write("teller: " + (fmt % a).split(" ")[0] + "\n")

    def _svar(self, kode, kropp):
        data = json.dumps(kropp).encode("utf-8")
        self.send_response(kode)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split("?")[0] != "/api/teller":
            self._svar(404, {"feil": "ukjent endepunkt"})
            return

        ip = klient_ip(self.headers, self.client_address[0])
        ua = self.headers.get("User-Agent", "")

        try:
            n, ny = registrer(ip, ua, tell=not BOT.search(ua))
        except sqlite3.Error as e:
            self._svar(503, {"feil": str(e)})
            return
        self._svar(200, {"n": n, "ny": ny})


def main():
    global SALT
    os.makedirs(os.path.dirname(DB) or ".", exist_ok=True)
    klargjor()
    SALT = salt()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    sys.stderr.write(f"teller: lytter på 127.0.0.1:{PORT}, db={DB}\n")
    srv.serve_forever()


if __name__ == "__main__":
    main()
