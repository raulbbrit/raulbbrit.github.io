/* Campo ASCII: clusters de pontos em movimento. Cada célula vira um caractere
   conforme a densidade. Expõe Site.field(); hero e contato passam a própria configuração. */
(function (S) {
  'use strict';

  var RAMP = ' .:-=+*#%@';
  var COLORS = ['#7c9cff', '#ededed', '#a4a4ac', '#6c6c74'];
  var KERNEL = [[0, 0, 1], [1, 0, 0.45], [-1, 0, 0.45], [0, 1, 0.45], [0, -1, 0.45],
                [1, 1, 0.2], [-1, 1, 0.2], [1, -1, 0.2], [-1, -1, 0.2]];

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    var u = 0, v = 0;
    while (!u) u = r();
    while (!v) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* cv: canvas dos pontos; bg: canvas da textura; os dois ficam dentro da seção que reage ao mouse.
     opts: centers(narrow, W, H) devolve os 4 centros em fração da área; seed, per e spread ajustam a nuvem;
     wideOnly desliga o campo no celular */
  S.field = function (cv, bg, opts) {
    if (!cv || !bg) return;
    var host = cv.parentElement;
    var ctx = cv.getContext('2d'), bgx = bg.getContext('2d');

    var K = 4, PER = opts.per || 380, LH_RATIO = 1.9;

    var W = 0, H = 0, cell = 12, cw = 7.2, lh = 13.8, cols = 0, rows = 0;
    var narrow = false;
    var pts = [], dens = [], tot = null, best = null;
    var mx = -1e3, my = -1e3;
    var running = false, last = 0, raf = 0;

    function centers() { return opts.centers(narrow, W, H); }
    function off() { return opts.wideOnly && narrow; }

    function build() {
      var r = rng(opts.seed || 7);
      var rect = host.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.floor(rect.width));
      H = Math.max(1, Math.floor(rect.height));
      narrow = W < 721;
      cell = narrow ? 10 : 12;
      cw = cell * 0.6;
      lh = cell * 1.15;
      cols = Math.floor(W / cw);
      rows = Math.floor(H / lh);

      [cv, bg].forEach(function (c) {
        c.width = W * dpr; c.height = H * dpr;
        c.style.width = W + 'px'; c.style.height = H + 'px';
      });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bgx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // textura ambiente, desenhada uma vez
      bgx.clearRect(0, 0, W, H);
      bgx.font = cell + 'px "Geist Mono", ui-monospace, monospace';
      bgx.textBaseline = 'top';
      bgx.fillStyle = 'rgba(255,255,255,0.075)';
      for (var y = 0; y < rows; y += 2) {
        for (var x = 0; x < cols; x += 3) bgx.fillText('.', x * cw, y * lh);
      }

      if (off()) { bgx.clearRect(0, 0, W, H); ctx.clearRect(0, 0, W, H); return; }

      var sx = cols * (narrow ? 0.055 : 0.034) * (opts.spread || 1);
      var sy = sx / LH_RATIO;
      pts = [];
      for (var k = 0; k < K; k++) {
        for (var i = 0; i < PER; i++) {
          pts.push({ k: k, ox: gauss(r) * sx, oy: gauss(r) * sy, ph: r() * 6.283 });
        }
      }
      dens = [];
      for (var j = 0; j < K; j++) dens.push(new Float32Array(cols * rows));
      tot = new Float32Array(cols * rows);
      best = new Int8Array(cols * rows);
    }

    function draw(t) {
      if (off()) return;
      var cs = centers();
      var n = cols * rows, i, k;
      for (k = 0; k < K; k++) dens[k].fill(0);

      for (i = 0; i < pts.length; i++) {
        var p = pts[i], c = cs[p.k];
        var ang = t * 0.00009 * (p.k % 2 ? 1 : -1);
        var br = 1 + 0.12 * Math.sin(t * 0.0006 + p.ph);
        var ca = Math.cos(ang), sa = Math.sin(ang);
        var ox = (p.ox * ca - p.oy * LH_RATIO * sa) * br;
        var oy = (p.ox * sa / LH_RATIO + p.oy * ca) * br;
        var drift = Math.sin(t * 0.00021 * (p.k + 1) + p.k) * cols * 0.014;
        var drift2 = Math.cos(t * 0.00017 * (p.k + 2) + p.k) * rows * 0.03;
        var x = c[0] * cols + drift + ox;
        var y = c[1] * rows + drift2 + oy;

        var dx = x - mx, dy = (y - my) * LH_RATIO, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 14 && d > 0.01) {
          var f = 1 - d / 14; f *= f * 7;
          x += (dx / d) * f; y += (dy / d) * f / LH_RATIO;
        }

        var cx = Math.round(x), cy = Math.round(y);
        var arr = dens[p.k];
        for (var q = 0; q < KERNEL.length; q++) {
          var gx = cx + KERNEL[q][0], gy = cy + KERNEL[q][1];
          if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) arr[gy * cols + gx] += KERNEL[q][2];
        }
      }

      for (i = 0; i < n; i++) {
        var tt = 0, bi = 0, bv = -1;
        for (k = 0; k < K; k++) {
          var v = dens[k][i];
          tt += v;
          if (v > bv) { bv = v; bi = k; }
        }
        tot[i] = tt; best[i] = bi;
      }

      ctx.clearRect(0, 0, W, H);
      ctx.font = '500 ' + cell + 'px "Geist Mono", ui-monospace, monospace';
      ctx.textBaseline = 'top';
      for (k = 0; k < K; k++) {
        ctx.fillStyle = COLORS[k];
        for (i = 0; i < n; i++) {
          if (best[i] !== k || tot[i] < 0.35) continue;
          var idx = Math.min(RAMP.length - 1, Math.floor(tot[i] * 1.1));
          if (idx < 1) continue;
          ctx.globalAlpha = 0.45 + 0.55 * (idx / (RAMP.length - 1));
          ctx.fillText(RAMP.charAt(idx), (i % cols) * cw, Math.floor(i / cols) * lh);
        }
      }
      ctx.globalAlpha = 1;
    }

    function loop(now) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      draw(now);
    }
    var visible = !S.hasIO;
    function start() { if (!running && !S.reduce && visible && !off()) { running = true; raf = requestAnimationFrame(loop); } }
    function stop() { running = false; cancelAnimationFrame(raf); }

    host.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect();
      mx = (e.clientX - r.left) / cw;
      my = (e.clientY - r.top) / lh;
    });
    host.addEventListener('pointerleave', function () { mx = -1e3; my = -1e3; });

    // refaz o campo quando a seção muda de tamanho (girar o celular, fonte que termina de
    // carregar, título que muda de altura), não só quando a janela muda
    var rq = 0;
    function rebuild() {
      cancelAnimationFrame(rq);
      rq = requestAnimationFrame(function () {
        var r = host.getBoundingClientRect();
        if (Math.floor(r.width) === W && Math.floor(r.height) === H) return;
        build(); draw(performance.now()); if (off()) stop(); else start();
      });
    }
    if ('ResizeObserver' in window) new ResizeObserver(rebuild).observe(host);
    else window.addEventListener('resize', rebuild);
    if (S.hasIO) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) start(); else stop(); }).observe(host);
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });

    build();
    draw(6000);
    start();
    if (document.fonts && document.fonts.load) {
      document.fonts.load('500 12px "Geist Mono"').then(function () { draw(performance.now()); });
    }
  };
})(window.Site);
