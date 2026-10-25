/* Contato: campo ASCII com os quatro clusters convergindo em um e relógio de São Paulo */
(function (S) {
  'use strict';

  // as mesmas quatro áreas do hero convergem em uma, k = 1 (só em telas largas)
  S.field(S.$('#field-end'), S.$('#field-end-bg'), {
    seed: 11, per: 200, spread: 0.75, wideOnly: true,
    centers: function () { return [[0.85, 0.2], [0.875, 0.225], [0.835, 0.24], [0.86, 0.255]]; }
  });

  S.reveal('.big-links li');

  var clock = S.$('#clock');
  if (clock) {
    var fmt;
    try { fmt = new Intl.DateTimeFormat(S.LOC, { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); } catch (e) { fmt = null; }
    var tick = function () { if (fmt) clock.textContent = S.EN ? 'now ' + fmt.format(new Date()) + ' in SP' : 'agora ' + fmt.format(new Date()) + ' em SP'; };
    tick();
    setInterval(tick, 20000);
  }
})(window.Site);
