/* Hero: título que sobe letra por letra, campo ASCII com quatro clusters e botão magnético */
(function (S) {
  'use strict';

  // título: quebra em letras para a animação de entrada, uma única vez
  var h1 = S.$('h1');
  if (h1) {
    h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());
    if (!S.reduce) {
      var idx = 0;
      S.$$('span', h1).forEach(function (line) {
        var words = line.textContent.trim().split(' ');
        line.textContent = '';
        line.classList.add('line');
        words.forEach(function (word, wi) {
          var w = document.createElement('span');
          w.className = 'w';
          w.setAttribute('aria-hidden', 'true');
          word.split('').forEach(function (chr) {
            var s = document.createElement('span');
            s.className = 'ch';
            s.style.setProperty('--i', idx++);
            s.textContent = chr;
            w.appendChild(s);
          });
          line.appendChild(w);
          if (wi < words.length - 1) line.appendChild(document.createTextNode(' '));
        });
      });
    }
    h1.classList.add('ready');
  }

  // campo: quatro áreas separadas, k = 4. No celular ficam na faixa reservada abaixo
  // dos botões (padding-bottom do .hero-copy), medidas a partir do fim do hero.
  S.field(S.$('#field'), S.$('#field-bg'), {
    centers: function (narrow, W, H) {
      if (!narrow) return [[0.85, 0.42], [0.95, 0.62], [0.70, 0.70], [0.86, 0.78]];
      var up = function (px) { return 1 - px / H; };
      return [[0.26, up(232)], [0.74, up(250)], [0.30, up(104)], [0.76, up(98)]];
    }
  });

  // botão principal acompanha o mouse de leve
  if (!S.reduce && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
    S.$$('.actions .btn.primary').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * 0.12) + 'px,' + ((e.clientY - r.top - r.height / 2) * 0.25) + 'px)';
      });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
  }
})(window.Site);
