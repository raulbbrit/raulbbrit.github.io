/* Faixa de números: contam de zero até o valor quando entram na tela.
   Cada <strong> usa data-count, data-dec, data-prefix e data-suffix. */
(function (S) {
  'use strict';

  var els = S.$$('[data-count]');
  if (!els.length || S.reduce || !S.hasIO) return;

  function fmt(el, v) {
    var d = +el.getAttribute('data-dec') || 0;
    return (el.getAttribute('data-prefix') || '') +
      v.toLocaleString(S.LOC, { minimumFractionDigits: d, maximumFractionDigits: d }) +
      (el.getAttribute('data-suffix') || '');
  }
  function run(el) {
    var to = +el.getAttribute('data-count'), t0 = null;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(el, to * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  els.forEach(function (el) { el.textContent = fmt(el, 0); });
  S.onceVisible(els, run, { threshold: 0.6 });
})(window.Site);
