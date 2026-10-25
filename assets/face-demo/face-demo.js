/* Demo de anonimização: detecta rostos no navegador (BlazeFace, MediaPipe) e cobre
   com mosaico. Nada sai do aparelho; o modelo só baixa quando a janela abre. */
(function (S) {
  'use strict';

  var $ = S.$;
  var dlg = $('#cv-demo'), open = $('#cv-demo-open');
  if (!dlg || !open || typeof dlg.showModal !== 'function') return;
  open.hidden = false;

  var T = S.EN ? {
    loading: 'Loading the detection model…',
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

  // full-range: feito para rostos a até uns 5 m (o short-range só vai até uns 2 m)
  var CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';
  var MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite';
  var out = $('#cv-out'), ctx = out.getContext('2d');
  var status = $('#cv-status'), camBtn = $('#cv-cam'), pick = $('#cv-pick'), file = $('#cv-file');
  var save = $('#cv-save'), boxes = $('#cv-boxes');
  var acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#7c9cff';
  var det = null, loading = null;
  // camSession muda a cada parada: um pedido de câmera que chega depois disso é descartado
  var video = null, stream = null, raf = 0, camSession = 0, camPending = false;
  var still = null, stillFaces = [];
  var tmp = document.createElement('canvas'), tctx = tmp.getContext('2d');
  var work = document.createElement('canvas'), wctx = work.getContext('2d', { willReadFrequently: true });

  function say(s) { status.textContent = s; }
  function count(n) { return n === 0 ? T.none : n === 1 ? T.one : n + T.many; }

  // carrega o MediaPipe e o modelo uma única vez; tenta GPU e cai para CPU
  function load() {
    if (loading) return loading;
    say(T.loading);
    loading = import(CDN + '/vision_bundle.mjs').then(function (m) {
      return m.FilesetResolver.forVisionTasks(CDN + '/wasm').then(function (fs) {
        function make(d) {
          return m.FaceDetector.createFromOptions(fs, {
            baseOptions: { modelAssetPath: MODEL, delegate: d },
            runningMode: 'IMAGE',
            minDetectionConfidence: 0.6
          });
        }
        return make('GPU').catch(function () { return make('CPU'); });
      });
    }).then(function (d) {
      det = d; say('');
      return d;
    }, function (e) {
      loading = null;
      say(T.loadFail);
      throw e;
    });
    return loading;
  }

  /* O modelo enxerga a imagem em 192x192, então rosto pequeno some. Além da imagem
     inteira, roda em pedaços sobrepostos (grade n x n): dentro do pedaço o rosto fica
     grande. Detecções do mesmo rosto em pedaços vizinhos viram uma caixa só. */
  function findFaces(src, w, h, grids) {
    var found = [];
    function run(sx, sy, sw, sh) {
      work.width = sw; work.height = sh;
      wctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
      det.detect(work).detections.forEach(function (d) {
        var b = d.boundingBox;
        found.push({ x: b.originX + sx, y: b.originY + sy, w: b.width, h: b.height, s: (d.categories[0] || {}).score || 0 });
      });
    }
    grids.forEach(function (n) {
      if (n === 1) { run(0, 0, w, h); return; }
      var tw = Math.min(w, Math.ceil(w / n * 1.35)), th = Math.min(h, Math.ceil(h / n * 1.35));
      for (var i = 0; i < n; i++) {
        for (var j = 0; j < n; j++) run(Math.round((w - tw) * i / (n - 1)), Math.round((h - th) * j / (n - 1)), tw, th);
      }
    });
    return merge(found);
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
      video = document.createElement('video');
      video.muted = true; video.playsInline = true;
      video.srcObject = s;
      return video.play();
    }).then(alive).then(function () {
      camPending = false;
      camBtn.textContent = T.camStop;
      say(T.live);
      // detectar custa mais que desenhar: detecta até 20 vezes por segundo e
      // redesenha todo quadro com as últimas caixas (a margem do mosaico cobre o atraso)
      var faces = [], lastDet = 0;
      (function tick(now) {
        if (!video) return;
        raf = requestAnimationFrame(tick);
        if (video.readyState < 2) return;
        var vw = video.videoWidth, vh = video.videoHeight;
        if (!now || now - lastDet > 50) { faces = findFaces(video, vw, vh, [1, 2]); lastDet = now || 0; }
        paint(video, vw, vh, faces, true);
      })();
    }).catch(function (e) {
      if (e === CANCEL) return;
      stopCam();
      if (!det) return;   // load() já avisou
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
        still = c;
        stillFaces = findFaces(c, c.width, c.height, [1, 2, 3, 4]);
        paint(c, c.width, c.height, stillFaces, false);
        save.hidden = false;
        say(count(stillFaces.length));
      }).catch(function () {});
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
