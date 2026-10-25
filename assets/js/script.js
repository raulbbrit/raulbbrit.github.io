(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;
  var EN = /^en/i.test(document.documentElement.lang || '');
  var LOC = EN ? 'en-US' : 'pt-BR';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* Animações das figuras só entram quando o navegador suporta e o usuário não pediu movimento reduzido */
  if (!reduce && hasIO) document.documentElement.classList.add('anim');

  /* =========================================================
     1. Título: sobe letra por letra, uma única vez
     ========================================================= */
  function splitHero() {
    var h1 = $('h1');
    if (!h1) return;
    h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());
    if (!reduce) {
      var idx = 0;
      $$('span', h1).forEach(function (line) {
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

  /* =========================================================
     2. Campo ASCII do hero: clusters de pontos em movimento.
        Cada célula vira um caractere conforme a densidade.
     ========================================================= */
  var RAMP = ' .:-=+*#%@';

  /* opts: centers(narrow) devolve os 4 centros; seed, per e spread ajustam a nuvem;
     wideOnly desliga o campo no celular */
  function field(cv, bg, opts) {
    if (!cv || !bg) return;
    var hero = cv.parentElement;
    var ctx = cv.getContext('2d'), bgx = bg.getContext('2d');

    var COLORS = ['#7c9cff', '#ededed', '#a4a4ac', '#6c6c74'];
    var K = 4, PER = opts.per || 380, LH_RATIO = 1.9;

    var W = 0, H = 0, cell = 12, cw = 7.2, lh = 13.8, cols = 0, rows = 0;
    var narrow = false;
    var pts = [], dens = [], tot = null, best = null;
    var mx = -1e3, my = -1e3;
    var running = false, last = 0, raf = 0;

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

    function centers() { return opts.centers(narrow); }
    function off() { return opts.wideOnly && narrow; }

    function build() {
      var r = rng(opts.seed || 7);
      var rect = hero.getBoundingClientRect();
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

    var KERNEL = [[0, 0, 1], [1, 0, 0.45], [-1, 0, 0.45], [0, 1, 0.45], [0, -1, 0.45],
                  [1, 1, 0.2], [-1, 1, 0.2], [1, -1, 0.2], [-1, -1, 0.2]];

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
    var visible = !hasIO;
    function start() { if (!running && !reduce && visible && !off()) { running = true; raf = requestAnimationFrame(loop); } }
    function stop() { running = false; cancelAnimationFrame(raf); }

    hero.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect();
      mx = (e.clientX - r.left) / cw;
      my = (e.clientY - r.top) / lh;
    });
    hero.addEventListener('pointerleave', function () { mx = -1e3; my = -1e3; });

    var rq = 0;
    window.addEventListener('resize', function () {
      cancelAnimationFrame(rq);
      rq = requestAnimationFrame(function () { build(); draw(performance.now()); if (off()) stop(); else start(); });
    });
    if (hasIO) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) start(); else stop(); }).observe(hero);
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });

    build();
    draw(6000);
    start();
    if (document.fonts && document.fonts.load) {
      document.fonts.load('500 12px "Geist Mono"').then(function () { draw(performance.now()); });
    }
  }

  /* =========================================================
     3. Números: contam ao entrar na tela
     ========================================================= */
  function counters() {
    var els = $$('[data-count]');
    if (!els.length || reduce || !hasIO) return;
    function fmt(el, v) {
      var d = +el.getAttribute('data-dec') || 0;
      return (el.getAttribute('data-prefix') || '') +
        v.toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d }) +
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
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        run(e.target);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* =========================================================
     4. Figuras e barras: animam uma vez ao entrar na tela
     ========================================================= */
  function figures() {
    var els = $$('.viz-cv, .viz-data, .meters, .tl, .viz-flow');
    if (!els.length || !hasIO) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        e.target.classList.add('in');
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { io.observe(el); });

    // clicar na ilustração do rosto repete a detecção e a anonimização
    var btn = $('#replay'), cv = $('.viz-cv');
    if (btn && cv) {
      btn.addEventListener('click', function () {
        cv.classList.remove('in');
        void cv.offsetWidth;
        cv.classList.add('in');
      });
    }
  }

  /* =========================================================
     5. Navegação: fundo ao rolar, indicador que desliza, seção ativa
     ========================================================= */
  function nav() {
    var top = $('.top'), navEl = $('.top nav'), ind = $('.nav-ind'), btn = $('.menu-btn');
    if (!top || !navEl || !ind) return;
    var links = $$('a', navEl), active = null;

    function setOpen(o) {
      top.classList.toggle('open', o);
      if (btn) { btn.setAttribute('aria-expanded', o ? 'true' : 'false'); btn.textContent = o ? (EN ? 'Close' : 'Fechar') : 'Menu'; }
    }
    if (btn) {
      btn.addEventListener('click', function () { setOpen(!top.classList.contains('open')); });
      links.forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
      document.addEventListener('click', function (e) { if (!top.contains(e.target)) setOpen(false); });
      window.addEventListener('resize', function () { if (window.innerWidth > 820) setOpen(false); });
    }

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

    function onScroll() {
      top.classList.toggle('scrolled', window.scrollY > 24);
      if (window.scrollY < 240 && active) {
        active = null;
        links.forEach(function (l) { l.classList.remove('on'); });
        place(null);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    links.forEach(function (a) {
      a.addEventListener('pointerenter', function () { place(a); });
      a.addEventListener('focus', function () { place(a); });
    });
    navEl.addEventListener('pointerleave', function () { place(active); });
    navEl.addEventListener('focusout', function () { place(active); });

    if (hasIO) {
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
      $$('main section[id]').forEach(function (s) { io.observe(s); });
    }
    window.addEventListener('resize', function () { place(active); });
    onScroll();
  }

  /* =========================================================
     6. Extras: progresso de leitura, revelar ao rolar, brilho nos blocos,
        botão magnético. Tudo opcional e desligado com movimento reduzido.
     ========================================================= */
  function extras() {
    if (reduce) return;

    var bar = document.createElement('div');
    bar.className = 'progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    var tick = 0;
    function prog() {
      tick = 0;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
    }
    window.addEventListener('scroll', function () { if (!tick) tick = requestAnimationFrame(prog); }, { passive: true });
    prog();

    if (hasIO) {
      var groups = ['.tile', '.job', '.edu > div', '.stack > div', '.certs', '.big-links li', '.split > .head h2', '.intro'];
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          e.target.classList.add('in');
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      groups.forEach(function (sel) {
        $$(sel).forEach(function (el, i) {
          el.classList.add('rv');
          el.style.setProperty('--rd', Math.min(i % 4, 3));
          io.observe(el);
        });
      });
    }

    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
      $$('.tile').forEach(function (t) {
        t.addEventListener('pointermove', function (e) {
          var r = t.getBoundingClientRect();
          t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
          t.style.setProperty('--my', (e.clientY - r.top) + 'px');
        });
      });
      $$('.btn.primary').forEach(function (b) {
        b.addEventListener('pointermove', function (e) {
          var r = b.getBoundingClientRect();
          b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * 0.12) + 'px,' + ((e.clientY - r.top - r.height / 2) * 0.25) + 'px)';
        });
        b.addEventListener('pointerleave', function () { b.style.transform = ''; });
      });
    }
  }

  /* =========================================================
     7. Detalhes vivos: a linha do tempo, os tempos de casa, o relógio
        e o rodapé seguem a data de hoje, sem precisar editar nada.
     ========================================================= */
  function live() {
    var now = new Date();
    var BASE = 2020;
    function yf(str) {                       // "2024-07" -> 2024.4167
      if (str === 'now') return now.getFullYear() + now.getMonth() / 12 + (now.getDate() - 1) / 365;
      var p = str.split('-');
      return +p[0] + (+p[1] - 1) / 12;
    }
    function months(a, b) {
      var p = a.split('-'), q = b ? b.split('-') : null;
      var y2 = q ? +q[0] : now.getFullYear(), m2 = q ? +q[1] - 1 : now.getMonth();
      return Math.max(0, (y2 - +p[0]) * 12 + (m2 - (+p[1] - 1)));
    }
    function span(m) {
      var y = Math.floor(m / 12), r = m % 12, out = [];
      if (EN) {
        if (y) out.push(y + (y === 1 ? ' year' : ' years'));
        if (r) out.push(r + (r === 1 ? ' month' : ' months'));
        return out.join(' and ') || 'under 1 month';
      }
      if (y) out.push(y + (y === 1 ? ' ano' : ' anos'));
      if (r) out.push(r + (r === 1 ? ' mês' : ' meses'));
      return out.join(' e ') || 'menos de 1 mês';
    }

    // linha do tempo: o eixo cresce junto com os anos
    var tl = $('#tl'), axis = $('#axis');
    if (tl && axis) {
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
      $$('.seg', tl).forEach(function (seg) {
        var f = seg.getAttribute('data-from'), t = seg.getAttribute('data-to');
        if (!f || !t) return;
        var s = yf(f) - BASE, e = yf(t) - BASE;
        seg.style.setProperty('--s', s.toFixed(3));
        seg.style.setProperty('--l', (e - s).toFixed(3));
        var running = t === 'now' || e + BASE > nowY;
        seg.classList.toggle('now', running);
        var prog = $('.prog', seg);
        if (prog) seg.style.setProperty('--p', Math.max(0, Math.min(1, (nowY - BASE - s) / (e - s))) * 100 + '%');
      });
      var today = $('#today');
      if (today) today.style.setProperty('--s', (nowY - BASE).toFixed(3));
      tl.setAttribute('aria-label', EN
        ? 'Timeline from ' + BASE + ' to ' + (BASE + n - 1) + '. Education: SENAI, FATEC and FIAP. Work: Desktop and Vivo (current).'
        : 'Linha do tempo de ' + BASE + ' a ' + (BASE + n - 1) + '. Formação: SENAI, FATEC e FIAP. Trabalho: Desktop e Vivo, atual.');
    }

    // tempo de casa
    $$('.tenure').forEach(function (el) {
      var since = el.getAttribute('data-since'), until = el.getAttribute('data-until');
      el.textContent = span(months(since, until));
    });

    // relógio de São Paulo
    var clock = $('#clock');
    if (clock) {
      var fmt;
      try { fmt = new Intl.DateTimeFormat(LOC, { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); } catch (e) { fmt = null; }
      var tick = function () { if (fmt) clock.textContent = EN ? 'now ' + fmt.format(new Date()) + ' in SP' : 'agora ' + fmt.format(new Date()) + ' em SP'; };
      tick();
      setInterval(tick, 20000);
    }

    var yr = $('#yr');
    if (yr) yr.textContent = now.getFullYear();
  }

  /* faixa de ferramentas: botão para pausar e retomar o movimento */
  function marquee() {
    var m = $('.marquee'), btn = $('.marquee-btn');
    if (!m || !btn) return;
    btn.addEventListener('click', function () {
      var p = m.classList.toggle('paused');
      btn.textContent = p ? (EN ? 'Play' : 'Continuar') : (EN ? 'Pause' : 'Pausar');
    });
  }

  /* fluxo do projeto: índice de cada passo para o atraso em cascata */
  function flowIdx() {
    $$('.flow li').forEach(function (li, i) { li.style.setProperty('--k', i); });
  }

  splitHero();
  // hero: quatro áreas separadas, k = 4
  field($('#field'), $('#field-bg'), {
    centers: function (narrow) {
      return narrow
        ? [[0.26, 0.76], [0.74, 0.74], [0.30, 0.93], [0.76, 0.94]]
        : [[0.85, 0.42], [0.95, 0.62], [0.70, 0.70], [0.86, 0.78]];
    }
  });
  // contato: as mesmas quatro convergem em uma, k = 1
  field($('#field-end'), $('#field-end-bg'), {
    seed: 11, per: 200, spread: 0.75, wideOnly: true,
    centers: function () { return [[0.85, 0.2], [0.875, 0.225], [0.835, 0.24], [0.86, 0.255]]; }
  });
  counters();
  figures();
  nav();
  extras();
  live();
  flowIdx();
  marquee();
})();
