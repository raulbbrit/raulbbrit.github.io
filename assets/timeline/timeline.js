/* Trajetória: monta a linha do tempo pela data de hoje. O eixo ganha anos novos sozinho,
   blocos com data-to="now" crescem e a marca "hoje" anda. */
(function (S) {
  'use strict';

  var tl = S.$('#tl'), axis = S.$('#axis');
  S.reveal('.intro');
  if (!tl || !axis) return;

  var now = new Date();
  var BASE = 2020;
  function yf(str) {                       // "2024-07" -> 2024.4167
    if (str === 'now') return now.getFullYear() + now.getMonth() / 12 + (now.getDate() - 1) / 365;
    var p = str.split('-');
    return +p[0] + (+p[1] - 1) / 12;
  }

  var nowY = yf('now');
  var n = Math.max(8, Math.floor(nowY) - BASE + 2);
  tl.style.setProperty('--n', n);
  axis.innerHTML = '';
  for (var i = 0; i < n; i++) {
    var el = document.createElement('i');
    el.style.setProperty('--s', i);
    el.textContent = BASE + i;
    axis.appendChild(el);
  }

  S.$$('.seg', tl).forEach(function (seg) {
    var f = seg.getAttribute('data-from'), t = seg.getAttribute('data-to');
    if (!f || !t) return;
    var s = yf(f) - BASE, e = yf(t) - BASE;
    seg.style.setProperty('--s', s.toFixed(3));
    seg.style.setProperty('--l', (e - s).toFixed(3));
    seg.classList.toggle('now', t === 'now' || e + BASE > nowY);
    if (S.$('.prog', seg)) seg.style.setProperty('--p', Math.max(0, Math.min(1, (nowY - BASE - s) / (e - s))) * 100 + '%');
  });

  var today = S.$('#today');
  if (today) today.style.setProperty('--s', (nowY - BASE).toFixed(3));
  tl.setAttribute('aria-label', S.EN
    ? 'Timeline from ' + BASE + ' to ' + (BASE + n - 1) + '. Education: SENAI, FATEC and FIAP. Work: Desktop and Vivo (current).'
    : 'Linha do tempo de ' + BASE + ' a ' + (BASE + n - 1) + '. Formação: SENAI, FATEC e FIAP. Trabalho: Desktop e Vivo, atual.');

  // os blocos crescem quando a linha do tempo entra na tela
  S.onceVisible([tl], function (el) { el.classList.add('in'); }, { threshold: 0.4 });
})(window.Site);
