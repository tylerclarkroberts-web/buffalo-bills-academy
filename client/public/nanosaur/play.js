// Behind the Nanosaur door in the Hall of Doors: loads the unmodified Nanosaur WebAssembly build (CC BY-NC-SA 4.0,
// see NOTICE.txt) the moment the door opens. That build skips the title screens and drops straight into the game.
// Everything runs inside this iframe; removing the iframe (Back in the parent page) ends the game and frees its memory.
(function () {
  'use strict';
  var V = '1'; // game files' cache key
  var DATA_SIZE = 18461446; // Nanosaur.data, uncompressed (the gzip Content-Length would overshoot the bar)
  var $ = function (id) { return document.getElementById(id); };
  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  var muted = false, running = false;
  if (coarse) document.body.classList.add('touch');

  function post(type, extra) { try { parent.postMessage(Object.assign({ src: 'bba-nanosaur', type: type }, extra || {}), location.origin); } catch (e) { /* standalone */ } }
  function fail(msg) { $('load').hidden = false; $('load-t').textContent = msg; $('load').classList.add('bad'); $('retry').hidden = false; post('error', { message: msg }); }
  function progress(f) { var p = Math.round(Math.max(0, Math.min(1, f || 0)) * 100); $('load-t').textContent = 'LOADING ' + p + '%'; $('load-b').style.width = p + '%'; }
  function started() {
    if (running) return; running = true;
    $('load').hidden = true; if (coarse) $('pad').hidden = false;
    window.__nanoRunning = true; post('started'); focusGame(); applyMute();
  }

  window.Module = {
    canvas: $('canvas'),
    print: function (t) { if (window.__dbg) console.log('[Nanosaur]', t); },
    printErr: function (t) { if (window.__dbg) console.warn('[Nanosaur]', t); },
    locateFile: function (p) { return p + (p ? '?v=' + V : ''); },
    setStatus: function (s) {
      if (!s) return;
      var m = /\((\d+)\/\d+\)/.exec(s); if (m) progress(+m[1] / DATA_SIZE);
    },
    monitorRunDependencies: function (left) { if (left === 0) progress(1); },
    // The published build creates its WebGL context through SDL3 (emscripten_webgl_create_context), which never runs
    // the legacy-GL emulation's "context created" hook, so its first glLoadMatrixf crashes on an empty matrix stack
    // (the upstream page shows a black screen). Run that hook once, the first time a context is made current.
    // The game files themselves are untouched.
    preRun: [function () { if (window.__bbaInstallWebGLFixes) window.__bbaInstallWebGLFixes(); }], // webgl-fixes.js
    instantiateWasm: function (imports, done) {
      window.__nanoPatched = window.__bbaPatchImports ? window.__bbaPatchImports(imports) : 0; // webgl-fixes.js
      var url = 'Nanosaur.wasm?v=' + V;
      var viaBytes = function () { return fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(function (b) { return WebAssembly.instantiate(b, imports); }); };
      var go = WebAssembly.instantiateStreaming ? WebAssembly.instantiateStreaming(fetch(url, { credentials: 'same-origin' }), imports).catch(viaBytes) : viaBytes();
      go.then(function (r) { done(r.instance, r.module); }, function () { fail('Did not load. Try again.'); });
      return {};
    },
    onRuntimeInitialized: function () { setTimeout(started, 50); },
    onAbort: function () { fail('The game stopped. Try again.'); },
  };
  window.addEventListener('error', function (e) { if (!running) fail('Did not load. Try again.'); });

  function focusGame() { try { window.focus(); $('canvas').focus(); } catch (e) { /* ignore */ } }
  function audioCtxs() {
    var out = [];
    try { if (window.Module && Module.SDL3 && Module.SDL3.audioContext) out.push(Module.SDL3.audioContext); } catch (e) { /* ignore */ }
    try { if (window.Module && Module.SDL2 && Module.SDL2.audioContext) out.push(Module.SDL2.audioContext); } catch (e) { /* ignore */ }
    (window.__bbaAudio || []).forEach(function (c) { out.push(c); });
    return out;
  }
  // SDL3 makes its own AudioContext; keep a handle on every one so the room's mute button works.
  (function () {
    var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    window.__bbaAudio = [];
    var Wrapped = function (o) { var c = new A(o); window.__bbaAudio.push(c); if (muted) { try { c.suspend().catch(function () {}); } catch (e) { /* ignore */ } } return c; };
    Wrapped.prototype = A.prototype;
    window.AudioContext = Wrapped; if (window.webkitAudioContext) window.webkitAudioContext = Wrapped;
  })();
  function applyMute() { audioCtxs().forEach(function (c) { if (c.state === 'closed') return; var p; try { p = (muted || document.hidden) ? c.suspend() : c.resume(); } catch (e) { /* ignore */ } if (p && p.catch) p.catch(function () {}); }); }
  $('retry').addEventListener('click', function () { location.reload(); });
  $('credits-open').addEventListener('click', function () { $('credits').hidden = false; });
  $('credits-close').addEventListener('click', function () { $('credits').hidden = true; focusGame(); });

  // Touch controls: press and release real key events, which is where SDL listens.
  var CODES = { ArrowUp: [38, 'ArrowUp'], ArrowDown: [40, 'ArrowDown'], ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'], ControlLeft: [17, 'Control'], AltLeft: [18, 'Alt'], Space: [32, ' '], ShiftLeft: [16, 'Shift'], Escape: [27, 'Escape'], Enter: [13, 'Enter'], Tab: [9, 'Tab'], KeyA: [65, 'a'], KeyZ: [90, 'z'], KeyG: [71, 'g'] };
  function key(type, code) {
    var c = CODES[code]; if (!c) return;
    var e = new KeyboardEvent(type, { code: code, key: c[1], bubbles: true, cancelable: true });
    Object.defineProperty(e, 'keyCode', { get: function () { return c[0]; } });
    Object.defineProperty(e, 'which', { get: function () { return c[0]; } });
    window.dispatchEvent(e);
  }
  window.__nanoKey = key; // used by the automated checks
  // Alt and Tab are browser keys too: keep the page from acting on them while the game has focus.
  window.addEventListener('keydown', function (e) { if (e.code === 'Tab' || e.code === 'AltLeft' || e.code === 'AltRight' || e.code === 'Space' || /^Arrow/.test(e.code)) e.preventDefault(); });
  window.addEventListener('keyup', function (e) { if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault(); });
  Array.prototype.forEach.call(document.querySelectorAll('#pad button'), function (b) {
    var down = false;
    b.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); try { b.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic or already-released pointer */ }
      if (b.dataset.tap) { var k = b.dataset.k; key('keydown', k); setTimeout(function () { key('keyup', k); }, 90); return; }
      down = true; b.classList.add('on'); key('keydown', b.dataset.k);
    });
    var up = function () { if (!down) return; down = false; b.classList.remove('on'); key('keyup', b.dataset.k); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  });
  $('canvas').addEventListener('pointerdown', function () { if (!coarse) focusGame(); });

  window.addEventListener('message', function (ev) {
    if (ev.origin !== location.origin || !ev.data || ev.data.src !== 'bba-mine') return;
    if (ev.data.type === 'mute') { muted = !!ev.data.muted; applyMute(); }
    if (ev.data.type === 'focus') focusGame();
  });
  document.addEventListener('visibilitychange', applyMute);
  post('ready');
  progress(0);
  var s = document.createElement('script'); s.src = 'Nanosaur.js?v=' + V; s.async = true; s.onerror = function () { fail('Did not load. Try again.'); };
  document.body.appendChild(s);
})();
