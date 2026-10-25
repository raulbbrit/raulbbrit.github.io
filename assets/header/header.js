/* Topo: fundo ao rolar, indicador que desliza entre os links, seção ativa,
   menu mobile e barra de progresso de leitura */
(function (S) {
  'use strict';

  var top = S.$('.top'), navEl = S.$('.top nav'), ind = S.$('.nav-ind'), btn = S.$('.menu-btn');
  if (!top || !navEl || !ind) return;
  var links = S.$$('a', navEl), active = null;

  // ---------- menu mobile ----------
  function setOpen(o) {
    top.classList.toggle('open', o);
    if (btn) { btn.setAttribute('aria-expanded', o ? 'true' : 'false'); btn.textContent = o ? (S.EN ? 'Close' : 'Fechar') : 'Menu'; }
  }
  if (btn) {
    btn.addEventListener('click', function () { setOpen(!top.classList.contains('open')); });
    links.forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    document.addEventListener('click', function (e) { if (!top.contains(e.target)) setOpen(false); });
    window.addEventListener('resize', function () { if (window.innerWidth > 820) setOpen(false); });
  }

  // ---------- indicador que desliza até o link ----------
  function place(a) {
    if (!a || navEl.offsetParent === null) { ind.style.opacity = 0; return; }
    var nr = navEl.getBoundingClientRect(), r = a.getBoundingClientRect();
    var first = ind.style.opacity !== '1';
    if (first) ind.style.transition = 'none';
    ind.style.width = r.width + 'px';
    ind.style.height = r.height + 'px';
    ind.style.transform = 'translate(' + (r.left - nr.left) + 'px,' + (r.top - nr.top) + 'px)';
    if (first) { void ind.offsetWidth; ind.style.transition = ''; ind.style.opacity = 1; }
  }
  links.forEach(function (a) {
    a.addEventListener('pointerenter', function () { place(a); });
    a.addEventListener('focus', function () { place(a); });
  });
  navEl.addEventListener('pointerleave', function () { place(active); });
  navEl.addEventListener('focusout', function () { place(active); });
  window.addEventListener('resize', function () { place(active); });

  // ---------- fundo ao rolar e seção ativa ----------
  function onScroll() {
    top.classList.toggle('scrolled', window.scrollY > 24);
    if (window.scrollY < 240 && active) {
      active = null;
      links.forEach(function (l) { l.classList.remove('on'); });
      place(null);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (S.hasIO) {
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var a = map[e.target.id] || null;
        links.forEach(function (l) { l.classList.toggle('on', l === a); });
        active = a || null;
        place(active);
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    S.$$('main section[id]').forEach(function (s) { io.observe(s); });
  }

  // ---------- barra de progresso de leitura ----------
  if (!S.reduce) {
    var bar = document.createElement('div');
    bar.className = 'progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    var tick = 0;
    var prog = function () {
      tick = 0;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
    };
    window.addEventListener('scroll', function () { if (!tick) tick = requestAnimationFrame(prog); }, { passive: true });
    prog();
  }
})(window.Site);
