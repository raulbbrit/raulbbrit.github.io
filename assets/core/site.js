/* Base compartilhada por todos os módulos: preferências do usuário, idioma e utilitários.
   Carregado primeiro; os demais leem tudo de window.Site. */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;
  var EN = /^en/i.test(document.documentElement.lang || '');

  var S = window.Site = {
    reduce: reduce,
    hasIO: hasIO,
    EN: EN,
    LOC: EN ? 'en-US' : 'pt-BR',
    $: function (s, r) { return (r || document).querySelector(s); },
    $$: function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  };

  // roda o callback uma vez quando cada elemento entra na tela
  S.onceVisible = function (els, cb, opts) {
    if (!hasIO || !els.length) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        cb(e.target);
      });
    }, opts);
    els.forEach(function (el) { io.observe(el); });
  };

  // revela os elementos ao rolar, em cascata dentro de cada grupo (estilo .rv em base.css)
  S.reveal = function (selector) {
    if (reduce || !hasIO) return;
    var els = S.$$(selector);
    els.forEach(function (el, i) {
      el.classList.add('rv');
      el.style.setProperty('--rd', Math.min(i % 4, 3));
    });
    S.onceVisible(els, function (el) { el.classList.add('in'); }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  };

  /* Animações das figuras só entram quando o navegador suporta e o usuário não pediu movimento reduzido */
  if (!reduce && hasIO) document.documentElement.classList.add('anim');

  // títulos de seção, comuns a todas
  S.reveal('.split > .head h2');
})();
