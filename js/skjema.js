'use strict';

// Besøksteller. Ekte tall fra /api/teller når telletjenesten svarer, ellers
// faller vi tilbake til den gamle fleip-telleren som teller feil med vilje.
(function(){
  var el = document.getElementById('teller');

  function vis(n){ el.textContent = String(n).padStart(5,'0'); }

  function fleip(){
    var n = 42;
    vis(n);
    setInterval(function(){
      n += Math.floor(Math.random()*3);
      vis(n);
    }, 2500);
  }

  // Åpnet som fil på disk, eller nettleser uten fetch: ingen backend å spørre.
  if (!window.fetch || location.protocol === 'file:'){ fleip(); return; }

  fetch('/api/teller', {cache:'no-store'})
    .then(function(r){
      if (!r.ok) throw new Error('teller svarte ' + r.status);
      return r.json();
    })
    .then(function(d){ vis(d.n); })
    .catch(fleip);
})();

// «BESTILL VASK NÅ!!» hopper ned til kontaktskjemaet
(function(){
  var knapp = document.getElementById('til-bestilling');
  var mal   = document.getElementById('kontakt');
  knapp.addEventListener('click', function(){ mal.scrollIntoView(); });
})();

// Kontaktskjema: validering i JS, innsending via mailto
(function(){
  var skjema     = document.getElementById('bestilling');
  var kvittering = document.getElementById('kvittering');

  function meld(status, tekst){
    kvittering.className = 'kvittering vis ' + status;
    kvittering.textContent = tekst;
  }

  function verdi(id){
    return document.getElementById(id).value.trim();
  }

  skjema.addEventListener('submit', function(e){
    e.preventDefault();

    var navn    = verdi('navn');
    var tlf     = verdi('tlf');
    var adr     = verdi('adr');
    var type    = document.getElementById('type').value;
    var melding = verdi('melding');

    if (!navn || !tlf){
      meld('feil', 'Fyll inn navn og telefon, så tar vi kontakt.');
      return;
    }

    var emne = 'Forespørsel: ' + type + ' – ' + navn;
    var tekst =
      'Navn: ' + navn + '\n' +
      'Telefon: ' + tlf + '\n' +
      'Adresse: ' + (adr || '(ikke oppgitt)') + '\n' +
      'Type oppdrag: ' + type + '\n\n' +
      'Melding:\n' + (melding || '(ingen)');

    window.location.href = 'mailto:afras@hotmail.no'
      + '?subject=' + encodeURIComponent(emne)
      + '&body='    + encodeURIComponent(tekst);

    meld('ok', 'Takk, ' + navn + '! E-postprogrammet ditt åpnes nå med forespørselen ferdig utfylt — husk å trykke send der.');
  });
})();
