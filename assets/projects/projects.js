/* Projetos: figuras e métricas animam ao entrar na tela, brilho que segue o mouse e
   a ilustração do rosto que repete a detecção quando clicada */
(function (S) {
  'use strict';

  // pipeline do churn: índice de cada passo para o atraso em cascata
  S.$$('.flow li').forEach(function (li, i) { li.style.setProperty('--k', i); });

  S.reveal('.tile');
  S.onceVisible(S.$$('.viz-cv, .viz-data, .meters, .viz-flow'), function (el) {
    el.classList.add('in');
  }, { threshold: 0.4 });

  var btn = S.$('#replay'), cv = S.$('.viz-cv');
  if (btn && cv) {
    btn.addEventListener('click', function () {
      cv.classList.remove('in');
      void cv.offsetWidth;
      cv.classList.add('in');
    });
  }

  if (!S.reduce && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
    S.$$('.tile').forEach(function (t) {
      t.addEventListener('pointermove', function (e) {
        var r = t.getBoundingClientRect();
        t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        t.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }
})(window.Site);
