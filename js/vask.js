(function(){
  var lag    = document.getElementById('gjorme-lag');
  var flekk  = document.getElementById('gjorme-flekk');
  var stripe = document.getElementById('gjorme-stripe');
  var vasker = document.getElementById('vasker');
  var punkt  = document.getElementById('bunnpunkt');
  var knapp  = document.getElementById('vaskeknapp');
  var spiller = false, autoKjort = false;

  var redusert = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stotte = ('animate' in Element.prototype);
  if (!stotte){ if (knapp) knapp.style.display='none'; return; }

  var farger = ['#4a3421','#553c26','#3d2a1a','#63472c','#46301d'];
  function tall(a,b){ return a + Math.random()*(b-a); }

  function lagGjorme(){
    var d = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">'], i,cx,cy,rx,ry;
    for (i=0;i<15;i++){
      cx=tall(2,98); cy=tall(2,98); rx=tall(10,24); ry=tall(8,19);
      d.push('<ellipse cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" rx="'+rx.toFixed(1)+'" ry="'+ry.toFixed(1)+
             '" fill="'+farger[i%farger.length]+'" opacity="'+tall(.82,1).toFixed(2)+'" transform="rotate('+
             tall(0,180).toFixed(0)+' '+cx.toFixed(1)+' '+cy.toFixed(1)+')"/>');
    }
    for (i=0;i<70;i++){
      cx=tall(0,100); cy=tall(0,100); rx=tall(.4,3.4); ry=rx*tall(.6,1.4);
      d.push('<ellipse cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" rx="'+rx.toFixed(1)+'" ry="'+ry.toFixed(1)+
             '" fill="'+farger[i%farger.length]+'" opacity="'+tall(.6,.95).toFixed(2)+'"/>');
    }
    d.push('</svg>');
    flekk.innerHTML = d.join('');
  }

  function nullstill(){
    var b = lag.querySelectorAll('.boble'), i;
    for (i=0;i<b.length;i++) b[i].parentNode.removeChild(b[i]);
    [lag,flekk,stripe,vasker].forEach(function(el){
      if (el.getAnimations) el.getAnimations().forEach(function(a){ a.cancel(); });
    });
    lag.classList.remove('paa');
  }

  function bobler(){
    var i,b,str;
    for (i=0;i<46;i++){
      b = document.createElement('div');
      b.className = 'boble';
      str = tall(10,54);
      b.style.width = b.style.height = str.toFixed(0)+'px';
      b.style.left = tall(-2,100).toFixed(1)+'vw';
      lag.appendChild(b);
      (function(el){
        var opp=tall(105,150), sving=tall(-14,14), tid=tall(2200,4200);
        var a = el.animate([
          {transform:'translate(0,0) scale(.4)', opacity:0},
          {transform:'translate('+(sving*.4)+'vw,-'+(opp*.35)+'vh) scale(1)', opacity:1, offset:.22},
          {transform:'translate('+sving+'vw,-'+opp+'vh) scale(1.05)', opacity:0}
        ], {duration:tid, delay:tall(0,1100), easing:'cubic-bezier(.35,.1,.5,1)', fill:'forwards'});
        a.onfinish = function(){ if (el.parentNode) el.parentNode.removeChild(el); };
      })(b);
    }
  }

  function spill(){
    if (spiller) return;
    spiller = true;
    nullstill();
    lagGjorme();
    lag.classList.add('paa');

    flekk.animate([
      {transform:'scale(.3) rotate(-9deg)', opacity:0},
      {transform:'scale(1.07) rotate(3deg)', opacity:1, offset:.55},
      {transform:'scale(1) rotate(0deg)',   opacity:1}
    ], {duration:520, easing:'cubic-bezier(.2,1.35,.4,1)', fill:'forwards'});

    setTimeout(function(){
      vasker.animate([{left:'-18%',opacity:0},{left:'0%',opacity:1}],
                     {duration:420, easing:'ease-out', fill:'forwards'});
    }, 620);

    setTimeout(function(){
      var tid=2100, lett='linear';
      vasker.animate([{left:'0%'},{left:'100%'}], {duration:tid, easing:lett, fill:'forwards'});
      vasker.animate([
        {transform:'translateX(-50%) translateY(0) rotate(-2deg)'},
        {transform:'translateX(-50%) translateY(-14px) rotate(2deg)'},
        {transform:'translateX(-50%) translateY(0) rotate(-2deg)'}
      ], {duration:420, iterations:tid/420, easing:'ease-in-out'});
      flekk.animate([{clipPath:'inset(0 0 0 0%)'},{clipPath:'inset(0 0 0 100%)'}],
                    {duration:tid, easing:lett, fill:'forwards'});
      stripe.animate([{left:'0%',opacity:0},{left:'6%',opacity:.9,offset:.06},
                      {left:'94%',opacity:.9,offset:.94},{left:'100%',opacity:0}],
                     {duration:tid, easing:lett, fill:'forwards'});
    }, 1040);

    setTimeout(function(){
      vasker.animate([{left:'100%',opacity:1},{left:'126%',opacity:0}],
                     {duration:520, easing:'ease-in', fill:'forwards'});
      bobler();
    }, 3140);

    setTimeout(function(){
      lag.animate([{opacity:1},{opacity:0}], {duration:700, fill:'forwards'})
         .onfinish = function(){ nullstill(); spiller = false; };
    }, 7200);
  }

  window.falchVask = spill;
  if (knapp) knapp.addEventListener('click', function(e){ e.preventDefault(); spill(); });

  if (redusert) return;   // automatisk utløsning droppes ved redusert bevegelse

  function utlos(){
    if (autoKjort) return;
    autoKjort = true;
    spill();
  }

  if ('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(p){
      if (p[0].isIntersecting) { io.disconnect(); utlos(); }
    }, {threshold:1});
    io.observe(punkt);
  }

  // reserveløsning dersom observatøren ikke slår inn
  window.addEventListener('scroll', function(){
    if (autoKjort) return;
    var d = document.documentElement;
    if (window.innerHeight + window.pageYOffset >= d.scrollHeight - 8) utlos();
  }, {passive:true});
})();
