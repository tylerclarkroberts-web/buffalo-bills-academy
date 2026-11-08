// Behind the mine door: as soon as the door opens this frame loads the GPL Chocolate Doom WebAssembly build with the
// free Freedoom data and drops straight into the first map (E1M1, skill 2), with no title or menu screens.
// The game runs entirely in this iframe; removing the iframe (Exit in the parent page) ends it and frees its memory.
(function () {
  'use strict';
  var V = '27b'; // game files' cache key (unchanged since v27b)
  var $ = function (id) { return document.getElementById(id); };
  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  var started = false, muted = false;
  if (coarse) document.body.classList.add('touch');

  function post(type, extra) { try { parent.postMessage(Object.assign({ src: 'bba-doom', type: type }, extra || {}), location.origin); } catch (e) { /* standalone */ } }
  function fail(msg) { $('load-t').textContent = msg; $('load').classList.add('bad'); $('retry').hidden = false; started = false; post('error', { message: msg }); }
  function progress(f) { $('load-t').textContent = 'LOADING ' + Math.round((f || 0) * 100) + '%'; $('load-b').style.width = Math.round((f || 0) * 100) + '%'; }

  function fetchBytes(url, onp) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('Did not load (' + r.status + ')');
      var total = +r.headers.get('x-bba-size') || +r.headers.get('content-length') || 0;
      if (!r.body || !total) return r.arrayBuffer();
      var reader = r.body.getReader(), parts = [], got = 0;
      return (function pump() {
        return reader.read().then(function (x) {
          if (x.done) { var out = new Uint8Array(got), p = 0; parts.forEach(function (b) { out.set(b, p); p += b.length; }); return out.buffer; }
          parts.push(x.value); got += x.value.length; if (onp) onp(Math.min(1, got / total)); return pump();
        });
      })();
    });
  }

  // straight into the first map: -warp 1 1 skips the title loop and menus, -skill 2 is "not too rough"
  var ARGS = ['-iwad', 'freedoom1.wad', '-warp', '1', '1', '-skill', '2', '-window', '-nogui', '-nomusic', '-config', 'bba.cfg'];
  function start() {
    if (started) return; started = true;
    $('load').classList.remove('bad'); $('retry').hidden = true; progress(0);
    Promise.all([fetchBytes('freedoom1.wad?v=' + V, progress), fetchBytes('bba.cfg?v=' + V)]).then(function (r) {
      $('load-t').textContent = 'LOADING 100%';
      window.Module = {
        canvas: $('canvas'),
        noInitialRun: true,
        print: function (t) { if (window.__dbg) console.log(t); }, printErr: function (t) { if (window.__dbg) console.warn(t); }, setStatus: function () {},
        locateFile: function (p) { return p + '?v=' + V; },
        preRun: [function () {
          Module.FS.writeFile('/freedoom1.wad', new Uint8Array(r[0]));
          Module.FS.writeFile('/bba.cfg', new Uint8Array(r[1]));
        }],
        onRuntimeInitialized: function () {
          $('load').hidden = true; $('stage').hidden = false; if (coarse) $('pad').hidden = false;
          // -nomusic: the OPL music synth waits on an audio thread this single-threaded build doesn't have (as upstream).
          try { Module.callMain(ARGS); } catch (e) { if (!(e && e.name === 'ExitStatus')) console.warn(e); }
          window.__doomRunning = true; window.__doomArgs = ARGS.slice(); post('started', { map: 'E1M1' });
          focusGame(); applyMute();
        },
      };
      var s = document.createElement('script'); s.src = 'websockets-doom.js?v=' + V; s.onerror = function () { fail('Did not load. Try again.'); };
      document.body.appendChild(s);
    }).catch(function (e) { fail(e.message + '. Try again.'); });
  }

  function focusGame() { try { window.focus(); $('canvas').focus(); } catch (e) { /* ignore */ } }
  function audioCtx() { try { return window.Module && Module.SDL2 && Module.SDL2.audioContext; } catch (e) { return null; } }
  function applyMute() { var c = audioCtx(); if (c) { if (muted) c.suspend(); else c.resume(); } }
  $('retry').addEventListener('click', function () { location.reload(); });
  $('credits-open').addEventListener('click', function () { $('credits').hidden = false; });
  $('credits-close').addEventListener('click', function () { $('credits').hidden = true; focusGame(); });

  // Touch controls: press and release real key events on the window, which is where SDL listens.
  var CODES = { ArrowUp: [38, 'ArrowUp'], ArrowDown: [40, 'ArrowDown'], ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'], ControlLeft: [17, 'Control'], Space: [32, ' '], ShiftLeft: [16, 'Shift'], Escape: [27, 'Escape'], Enter: [13, 'Enter'], KeyY: [89, 'y'], Tab: [9, 'Tab'], Digit1: [49, '1'], Digit2: [50, '2'], Digit3: [51, '3'], Digit4: [52, '4'], Digit5: [53, '5'], Digit6: [54, '6'], Digit7: [55, '7'] };
  function key(type, code) {
    var c = CODES[code]; if (!c) return;
    var e = new KeyboardEvent(type, { code: code, key: c[1], bubbles: true, cancelable: true });
    Object.defineProperty(e, 'keyCode', { get: function () { return c[0]; } });
    Object.defineProperty(e, 'which', { get: function () { return c[0]; } });
    window.dispatchEvent(e);
  }
  window.__doomKey = key; // used by the automated checks
  // Extra fire buttons (v32): F and a left click on the picture both work as Ctrl. The engine only has one fire key
  // (key_fire = Ctrl), so these are translated here into Ctrl presses; the engine itself is untouched.
  var held = { f: false, m: false };
  function fire(src, on) {
    var was = held.f || held.m; held[src] = on; var now = held.f || held.m;
    if (now !== was) key(now ? 'keydown' : 'keyup', 'ControlLeft');
  }
  window.addEventListener('keydown', function (e) { if (e.code === 'KeyF' && e.isTrusted) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) fire('f', true); } }, true);
  window.addEventListener('keyup', function (e) { if (e.code === 'KeyF' && e.isTrusted) { e.preventDefault(); e.stopImmediatePropagation(); fire('f', false); } }, true);
  $('canvas').addEventListener('pointerdown', function (e) { if (e.button !== 0 || coarse) return; focusGame(); fire('m', true); });
  window.addEventListener('pointerup', function (e) { if (e.button === 0) fire('m', false); });
  window.addEventListener('blur', function () { fire('f', false); fire('m', false); });
  window.__doomFireHeld = function () { return held.f || held.m; };
  var wpn = 1;
  Array.prototype.forEach.call(document.querySelectorAll('#pad button'), function (b) {
    var down = false;
    b.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); try { b.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic or already-released pointer */ }
      if (b.dataset.wpn) { wpn = wpn % 7 + 1; var d = 'Digit' + wpn; key('keydown', d); setTimeout(function () { key('keyup', d); }, 60); return; }
      if (b.dataset.toggle) { var on = !b.classList.contains('on'); b.classList.toggle('on', on); key(on ? 'keydown' : 'keyup', b.dataset.k); return; }
      down = true; b.classList.add('on'); key('keydown', b.dataset.k);
    });
    var up = function () { if (!down) return; down = false; b.classList.remove('on'); key('keyup', b.dataset.k); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  });

  window.addEventListener('message', function (ev) {
    if (ev.origin !== location.origin || !ev.data || ev.data.src !== 'bba-mine') return;
    if (ev.data.type === 'mute') { muted = !!ev.data.muted; applyMute(); }
    if (ev.data.type === 'focus') focusGame();
  });
  document.addEventListener('visibilitychange', function () { var c = audioCtx(); if (c && document.hidden) c.suspend(); else applyMute(); });
  post('ready');
  start();
})();
