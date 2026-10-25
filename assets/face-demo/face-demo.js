/* Demo de anonimização: detecta rostos no navegador (BlazeFace, via MediaPipe ou TensorFlow.js) e cobre
   com mosaico. Nada sai do aparelho; o modelo só baixa quando a janela abre. */
(function (S) {
  'use strict';

  var $ = S.$;
  var dlg = $('#cv-demo'), open = $('#cv-demo-open');
  if (!dlg || !open || typeof dlg.showModal !== 'function') return;
  open.hidden = false;

  var T = S.EN ? {
    loading: 'Loading the detection model…',
    working: 'Looking for faces…',
    loadFail: 'Could not load the model. Check your connection and try again.',
    none: 'No face found. Try a photo with faces turned to the camera and larger in the frame.',
    one: '1 face anonymized.',
    many: ' faces anonymized.',
    live: 'Camera on. Faces are anonymized in real time.',
    camStart: 'Use camera', camStop: 'Stop camera',
    camDenied: 'Camera access was blocked. Allow it in your browser settings or upload a photo.',
    camNone: 'No camera available. Upload a photo instead.',
    camFail: 'Could not open the camera. Upload a photo instead.',
    imgFail: 'Could not open this file. Use a JPG, PNG or WebP image.',
    face: 'face', file: 'anonymized.png'
  } : {
    loading: 'Carregando o modelo de detecção…',
    working: 'Procurando rostos…',
    loadFail: 'Não deu para carregar o modelo. Confira a conexão e tente de novo.',
    none: 'Nenhum rosto encontrado. Tente uma foto com os rostos de frente e maiores na imagem.',
    one: '1 rosto anonimizado.',
    many: ' rostos anonimizados.',
    live: 'Câmera ligada. Os rostos são anonimizados em tempo real.',
    camStart: 'Usar câmera', camStop: 'Parar câmera',
    camDenied: 'O acesso à câmera foi bloqueado. Libere nas configurações do navegador ou envie uma foto.',
    camNone: 'Nenhuma câmera disponível. Envie uma foto.',
    camFail: 'Não deu para abrir a câmera. Envie uma foto.',
    imgFail: 'Não deu para abrir esse arquivo. Use uma imagem JPG, PNG ou WebP.',
    face: 'rosto', file: 'anonimizado.png'
  };

  var out = $('#cv-out'), ctx = out.getContext('2d');
  var status = $('#cv-status'), camBtn = $('#cv-cam'), pick = $('#cv-pick'), file = $('#cv-file');
  var save = $('#cv-save'), boxes = $('#cv-boxes');
  var acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#7c9cff';
  var engine = null, loading = null;
  // camSession muda a cada parada: um pedido de câmera que chega depois disso é descartado
  var video = null, stream = null, raf = 0, camSession = 0, camPending = false;
  var still = null, stillFaces = [];
  var tmp = document.createElement('canvas'), tctx = tmp.getContext('2d');

  function say(s) { status.textContent = s; }
  function count(n) { return n === 0 ? T.none : n === 1 ? T.one : n + T.many; }

  /* ---------- motores de detecção ----------
     Os dois devolvem o mesmo formato: detect(canvas) -> Promise de [{ x, y, w, h, s }].
     1. MediaPipe (WebAssembly), modelo full-range: acha rostos a até uns 5 m.
     2. TensorFlow.js (WebGL), BlazeFace short-range: reserva para navegadores onde o
        WebAssembly do MediaPipe não roda, como o Safari do iPhone. */
  var MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';
  var MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite';
  var TF = 'https://cdn.jsdelivr.net/npm/@tensorflow/';
  var TF_SCRIPTS = [TF + 'tfjs-core@4.22.0/dist/tf-core.min.js', TF + 'tfjs-converter@4.22.0/dist/tf-converter.min.js',
    TF + 'tfjs-backend-webgl@4.22.0/dist/tf-backend-webgl.min.js', TF + 'tfjs-backend-cpu@4.22.0/dist/tf-backend-cpu.min.js',
    'https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.1.0/dist/blazeface.min.umd.js'];
  var MIN_SCORE = 0.6;

  function timeout(p, ms) {
    return Promise.race([p, new Promise(function (_, no) { setTimeout(function () { no(new Error('timeout')); }, ms); })]);
  }
  function script(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = src; s.crossOrigin = 'anonymous';
      s.onload = ok; s.onerror = function () { no(new Error(src)); };
      document.head.appendChild(s);
    });
  }

  function mediapipe() {
    return import(MP + '/vision_bundle.mjs').then(function (m) {
      return m.FilesetResolver.forVisionTasks(MP + '/wasm').then(function (fs) {
        function make(d) {
          return m.FaceDetector.createFromOptions(fs, {
            baseOptions: { modelAssetPath: MP_MODEL, delegate: d },
            runningMode: 'IMAGE',
            minDetectionConfidence: MIN_SCORE
          });
        }
        return make('GPU').catch(function () { return make('CPU'); });
      });
    }).then(function (d) {
      return {
        name: 'mediapipe', photoGrids: [1, 2, 3, 4], videoGrids: [1, 2],
        detect: function (c) {
          return Promise.resolve(d.detect(c).detections.map(function (r) {
            var b = r.boundingBox;
            return { x: b.originX, y: b.originY, w: b.width, h: b.height, s: (r.categories[0] || {}).score || 0 };
          }));
        }
      };
    });
  }

  // descarta detecções cujos pontos não formam um rosto: olhos lado a lado e quase na mesma
  // altura, nariz entre eles e abaixo, boca abaixo do nariz
  function plausible(f) {
    var L = f.landmarks;
    if (!L || L.length < 4) return true;
    var re = L[0], le = L[1], nose = L[2], mouth = L[3], w = f.bottomRight[0] - f.topLeft[0];
    var dx = Math.abs(le[0] - re[0]), dy = Math.abs(le[1] - re[1]), eyeY = (le[1] + re[1]) / 2;
    return dx > 0.25 * w && dy < 0.5 * dx && nose[1] > eyeY && mouth[1] > nose[1] - 0.05 * w &&
      nose[0] > Math.min(le[0], re[0]) - 0.1 * w && nose[0] < Math.max(le[0], re[0]) + 0.1 * w;
  }

  function tensorflow() {
    return TF_SCRIPTS.reduce(function (p, src) { return p.then(function () { return script(src); }); }, Promise.resolve())
      .then(function () { return window.tf.setBackend('webgl').catch(function () { return window.tf.setBackend('cpu'); }); })
      .then(function () { return window.tf.ready(); })
      .then(function () { return window.blazeface.load({ maxFaces: 20, scoreThreshold: MIN_SCORE }); })
      .then(function (model) {
        return {
          // grade até 4x4: com pedaços menores o modelo começa a ver rosto em mão e em estampa.
          // no vídeo, só a imagem inteira, pelo desempenho
          name: 'tfjs', photoGrids: [1, 2, 3, 4], videoGrids: [1],
          detect: function (c) {
            return model.estimateFaces(c, false).then(function (fs) {
              return fs.filter(plausible).map(function (f) {
                var p = Array.isArray(f.probability) ? f.probability[0] : +f.probability;
                return { x: f.topLeft[0], y: f.topLeft[1], w: f.bottomRight[0] - f.topLeft[0], h: f.bottomRight[1] - f.topLeft[1], s: p || 0 };
              });
            });
          }
        };
      });
  }

  // confere se o motor detecta de verdade (alguns navegadores carregam e só falham na primeira detecção)
  function probe(e) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    c.getContext('2d').fillRect(0, 0, 64, 64);
    return e.detect(c).then(function () { return e; });
  }

  // carrega um motor uma única vez; ?engine=tfjs na URL força o reserva (para testar)
  function load() {
    if (loading) return loading;
    say(T.loading);
    var forced = /[?&]engine=tfjs/.test(location.search);
    var first = forced ? Promise.reject(new Error('forced')) : timeout(mediapipe().then(probe), 25000);
    loading = first.catch(function () { return timeout(tensorflow().then(probe), 45000); }).then(function (e) {
      engine = e; say('');
      dlg.setAttribute('data-engine', e.name);
      return e;
    }, function (err) {
      loading = null;
      say(T.loadFail);
      throw err;
    });
    return loading;
  }

  /* Os modelos enxergam a imagem reduzida (192 ou 128 px), então rosto pequeno some. Além da
     imagem inteira, roda em pedaços sobrepostos (grade n x n): dentro do pedaço o rosto fica
     grande. Detecções do mesmo rosto em pedaços vizinhos viram uma caixa só. */
  function findFaces(src, w, h, grids) {
    var tiles = [];
    grids.forEach(function (n) {
      if (n === 1) { tiles.push([0, 0, w, h]); return; }
      var tw = Math.min(w, Math.ceil(w / n * 1.35)), th = Math.min(h, Math.ceil(h / n * 1.35));
      for (var i = 0; i < n; i++) {
        for (var j = 0; j < n; j++) tiles.push([Math.round((w - tw) * i / (n - 1)), Math.round((h - th) * j / (n - 1)), tw, th]);
      }
    });
    var found = [];
    // um pedaço por vez, num canvas só desta busca (câmera e foto não se atropelam)
    var work = document.createElement('canvas'), wctx = work.getContext('2d', { willReadFrequently: true });
    return tiles.reduce(function (p, t) {
      return p.then(function () {
        work.width = t[2]; work.height = t[3];
        wctx.drawImage(src, t[0], t[1], t[2], t[3], 0, 0, t[2], t[3]);
        return engine.detect(work).then(function (fs) {
          fs.forEach(function (f) { if (f.s >= MIN_SCORE) found.push({ x: f.x + t[0], y: f.y + t[1], w: f.w, h: f.h, s: f.s }); });
        });
      });
    }, Promise.resolve()).then(function () { return merge(found); });
  }

  // junta caixas que se sobrepõem bastante; fica a união, para cobrir o rosto inteiro
  function merge(list) {
    var res = [], changed = true;
    list.sort(function (a, b) { return b.w * b.h - a.w * a.h; });
    while (changed) {
      changed = false;
      res = [];
      list.forEach(function (f) {
        for (var i = 0; i < res.length; i++) {
          var m = res[i];
          var ix = Math.max(0, Math.min(m.x + m.w, f.x + f.w) - Math.max(m.x, f.x));
          var iy = Math.max(0, Math.min(m.y + m.h, f.y + f.h) - Math.max(m.y, f.y));
          if (ix * iy > 0.4 * Math.min(m.w * m.h, f.w * f.h)) {
            var x2 = Math.max(m.x + m.w, f.x + f.w), y2 = Math.max(m.y + m.h, f.y + f.h);
            m.x = Math.min(m.x, f.x); m.y = Math.min(m.y, f.y);
            m.w = x2 - m.x; m.h = y2 - m.y; m.s = Math.max(m.s, f.s);
            changed = true;
            return;
          }
        }
        res.push({ x: f.x, y: f.y, w: f.w, h: f.h, s: f.s });
      });
      list = res;
    }
    return res;
  }

  // desenha a imagem, cobre cada rosto com mosaico e marca com os cantos da ilustração
  function paint(src, w, h, faces, mirror) {
    if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
    out.classList.add('on');
    // traço e etiqueta com tamanho constante na tela, mesmo com a imagem reduzida
    var k = w / (out.clientWidth || w);
    ctx.save();
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();
    faces.forEach(function (f) {
      var bw = f.w * 1.3, bh = f.h * 1.5;
      var x = (mirror ? w - f.x - f.w : f.x) - f.w * 0.15;
      var y = f.y - f.h * 0.35;
      x = Math.max(0, x); y = Math.max(0, y);
      bw = Math.min(bw, w - x); bh = Math.min(bh, h - y);
      if (bw < 2 || bh < 2) return;

      var cell = Math.max(6, Math.round(bw / 9));
      tmp.width = Math.max(1, Math.round(bw / cell));
      tmp.height = Math.max(1, Math.round(bh / cell));
      tctx.drawImage(out, x, y, bw, bh, 0, 0, tmp.width, tmp.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, bw, bh);
      ctx.imageSmoothingEnabled = true;

      if (!boxes.checked) return;
      var lw = 2 * k, len = Math.min(bw, bh) * 0.22;
      ctx.strokeStyle = acc;
      ctx.lineWidth = lw;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
      ctx.moveTo(x + bw - len, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + len);
      ctx.moveTo(x + bw, y + bh - len); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + bw - len, y + bh);
      ctx.moveTo(x + len, y + bh); ctx.lineTo(x, y + bh); ctx.lineTo(x, y + bh - len);
      ctx.stroke();

      var fs = 12 * k;
      var label = T.face + ' ' + Math.round(f.s * 100) + '%';
      ctx.font = '500 ' + fs + 'px "Geist Mono", ui-monospace, monospace';
      var tw = ctx.measureText(label).width, th = fs * 1.5;
      var ty = y - th - lw * 2 < 0 ? y + bh + lw * 2 : y - th - lw * 2;
      ctx.fillStyle = acc;
      ctx.fillRect(x, ty, tw + fs, th);
      ctx.fillStyle = '#000';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + fs / 2, ty + th / 2);
    });
  }

  function stopCam() {
    camSession++;
    camPending = false;
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    if (video) { video.srcObject = null; video.remove(); }
    stream = null; video = null;
    camBtn.textContent = T.camStart;
  }

  function startCam() {
    if (camPending) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say(T.camNone); return; }
    var session = ++camSession;
    camPending = true;
    still = null; save.hidden = true;
    var CANCEL = {};
    function alive(s) {
      // a janela fechou ou a câmera foi parada enquanto o pedido estava pendente
      if (session === camSession) return s;
      if (s && s.getTracks) s.getTracks().forEach(function (t) { t.stop(); });
      throw CANCEL;
    }
    load().then(alive).then(function () {
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    }).then(alive).then(function (s) {
      stream = s;
      // o Safari do iPhone só atualiza os quadros de um vídeo que está na página e com
      // playsinline/muted como atributos; fica invisível dentro da janela
      video = document.createElement('video');
      video.className = 'demo-video';
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.setAttribute('aria-hidden', 'true');
      video.muted = true; video.playsInline = true; video.autoplay = true;
      video.srcObject = s;
      dlg.appendChild(video);
      return video.play();
    }).then(alive).then(function () {
      camPending = false;
      camBtn.textContent = T.camStop;
      say(T.live);
      // detectar custa mais que desenhar: detecta até 20 vezes por segundo, uma de cada vez,
      // e redesenha todo quadro com as últimas caixas (a margem do mosaico cobre o atraso)
      var faces = [], lastDet = 0, busy = false, mine = camSession;
      (function tick(now) {
        if (!video) return;
        raf = requestAnimationFrame(tick);
        if (video.readyState < 2 || !video.videoWidth) return;
        var vw = video.videoWidth, vh = video.videoHeight;
        if (!busy && (!now || now - lastDet > 50)) {
          busy = true; lastDet = now || 0;
          findFaces(video, vw, vh, engine.videoGrids).then(function (f) {
            if (mine === camSession) faces = f;
          }).catch(function () {}).then(function () { busy = false; });
        }
        paint(video, vw, vh, faces, true);
      })();
    }).catch(function (e) {
      if (e === CANCEL) return;
      stopCam();
      if (!engine) return;   // load() já avisou
      var n = e && e.name;
      say(n === 'NotAllowedError' || n === 'SecurityError' ? T.camDenied : n === 'NotFoundError' || n === 'OverconstrainedError' ? T.camNone : T.camFail);
    });
  }

  function usePhoto(f) {
    if (!f) return;
    stopCam();
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      // limita o lado maior para o processamento continuar rápido
      var k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      load().then(function () {
        say(T.working);
        // mostra a foto já, enquanto procura os rostos
        paint(c, c.width, c.height, [], false);
        return findFaces(c, c.width, c.height, engine.photoGrids);
      }).then(function (faces) {
        still = c; stillFaces = faces;
        paint(c, c.width, c.height, faces, false);
        save.hidden = false;
        say(count(faces.length));
      }).catch(function () { if (engine) say(T.imgFail); });
    };
    img.onerror = function () { URL.revokeObjectURL(url); say(T.imgFail); };
    img.src = url;
  }

  open.addEventListener('click', function () { dlg.showModal(); load().catch(function () {}); });
  $('#cv-close').addEventListener('click', function () { dlg.close(); });
  // clique fora da caixa (no fundo escurecido) fecha
  dlg.addEventListener('click', function (e) {
    var r = dlg.getBoundingClientRect();
    if (e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dlg.close();
  });
  dlg.addEventListener('close', stopCam);
  camBtn.addEventListener('click', function () { if (stream || camPending) { stopCam(); say(''); } else startCam(); });
  pick.addEventListener('click', function () { file.click(); });
  file.addEventListener('change', function () { usePhoto(file.files[0]); file.value = ''; });
  boxes.addEventListener('change', function () { if (still) paint(still, still.width, still.height, stillFaces, false); });
  save.addEventListener('click', function () {
    out.toBlob(function (blob) {
      if (!blob) return;
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = T.file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }, 'image/png');
  });
})(window.Site);
