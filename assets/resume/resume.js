/* Currículo: tempo de casa calculado pela data de hoje e entrada dos blocos ao rolar */
(function (S) {
  'use strict';

  var now = new Date();
  function months(a, b) {
    var p = a.split('-'), q = b ? b.split('-') : null;
    var y2 = q ? +q[0] : now.getFullYear(), m2 = q ? +q[1] - 1 : now.getMonth();
    return Math.max(0, (y2 - +p[0]) * 12 + (m2 - (+p[1] - 1)));
  }
  function span(m) {
    var y = Math.floor(m / 12), r = m % 12, out = [];
    if (S.EN) {
      if (y) out.push(y + (y === 1 ? ' year' : ' years'));
      if (r) out.push(r + (r === 1 ? ' month' : ' months'));
      return out.join(' and ') || 'under 1 month';
    }
    if (y) out.push(y + (y === 1 ? ' ano' : ' anos'));
    if (r) out.push(r + (r === 1 ? ' mês' : ' meses'));
    return out.join(' e ') || 'menos de 1 mês';
  }

  // data-since e data-until no formato "2024-07"; sem data-until = até hoje
  S.$$('.tenure').forEach(function (el) {
    el.textContent = span(months(el.getAttribute('data-since'), el.getAttribute('data-until')));
  });

  ['.job', '.edu > div', '.stack > div', '.certs'].forEach(S.reveal);
})(window.Site);
