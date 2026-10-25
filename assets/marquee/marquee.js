/* Faixa de ferramentas: botão para pausar e retomar o movimento */
(function (S) {
  'use strict';

  var m = S.$('.marquee'), btn = S.$('.marquee-btn');
  if (!m || !btn) return;
  btn.addEventListener('click', function () {
    var p = m.classList.toggle('paused');
    btn.textContent = p ? (S.EN ? 'Play' : 'Continuar') : (S.EN ? 'Pause' : 'Pausar');
  });
})(window.Site);
