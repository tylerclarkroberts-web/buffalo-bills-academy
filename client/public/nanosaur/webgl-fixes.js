// Small compatibility layer between the published Nanosaur WebAssembly build and WebGL. The game files are not
// modified; this only adjusts what reaches the browser's WebGL context. Installed from play.js (Module.preRun).
//  1. The build makes its context through SDL3, which skips the legacy-GL emulation's "context created" hook, so the
//     first glLoadMatrixf crashed (black screen on the upstream page too). Run that hook once.
//  2. WebGL only knows two glHint targets; drop the old fixed-function ones instead of raising INVALID_ENUM.
//  3. The 1998 renderer uploads Mac-style textures (BGRA as 16-bit 1-5-5-5 or packed 8-8-8-8), which WebGL can't take.
//     Convert those to plain RGBA bytes on the way in (once per texture load / backdrop update).
//  4. GL_UNPACK_ROW_LENGTH (used for the 2D backdrop) doesn't exist in WebGL1; it is applied during the conversion.
(function () {
  'use strict';
  var BGRA = 0x80E1, RGBA = 0x1908, UBYTE = 0x1401, U1555R = 0x8366, U8888 = 0x8035, U8888R = 0x8367;
  var ROW_LENGTH = 0x0CF2;
  var buf = new Uint8Array(0);
  function scratch(n) { if (buf.length < n) buf = new Uint8Array(n); return buf.subarray(0, n); }
  // pixels arrives as a view into the wasm heap that starts at the right address (its length may be wrong for
  // packed 32-bit types, so only its start is used). rowLen is GL_UNPACK_ROW_LENGTH in pixels (0 = width).
  function toRGBA(pixels, w, h, type, rowLen, opaque) {
    var base = pixels.byteOffset, heap = pixels.buffer;
    var stride = rowLen || w, out = scratch(w * h * 4), o = 0, x, y;
    if (type === U1555R) {
      var rowBytes = ((stride * 2) + 3) & ~3; // GL_UNPACK_ALIGNMENT 4
      var u16 = new Uint16Array(heap, base, ((rowBytes * (h - 1)) >> 1) + w);
      for (y = 0; y < h; y++) {
        var r0 = (rowBytes >> 1) * y;
        for (x = 0; x < w; x++) {
          var p = u16[r0 + x];
          var R = (p >> 10) & 31, G = (p >> 5) & 31, B = p & 31;
          out[o++] = (R << 3) | (R >> 2); out[o++] = (G << 3) | (G >> 2); out[o++] = (B << 3) | (B >> 2); out[o++] = (opaque || (p & 0x8000)) ? 255 : 0;
        }
      }
      return out;
    }
    var u8 = new Uint8Array(heap, base, stride * 4 * (h - 1) + w * 4);
    for (y = 0; y < h; y++) {
      var i = stride * 4 * y;
      for (x = 0; x < w; x++, i += 4) {
        if (type === U8888) { out[o++] = u8[i + 1]; out[o++] = u8[i + 2]; out[o++] = u8[i + 3]; out[o++] = opaque ? 255 : u8[i]; } // memory A R G B
        else { out[o++] = u8[i + 2]; out[o++] = u8[i + 1]; out[o++] = u8[i]; out[o++] = opaque ? 255 : u8[i + 3]; } // memory B G R A
      }
    }
    return out;
  }
  function rowLength() { try { return (window.GL && GL.unpackRowLength) || 0; } catch (e) { return 0; } }
  function plain(ctx, fn) { // our converted pixels are tightly packed: no row length while they upload
    var gl2 = typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext;
    var rl = gl2 ? ctx.getParameter(ROW_LENGTH) : 0;
    if (rl) ctx.pixelStorei(ROW_LENGTH, 0);
    try { fn(); } finally { if (rl) ctx.pixelStorei(ROW_LENGTH, rl); }
  }
  function fixContext(ctx) {
    if (!ctx || ctx.__bbaFixed) return; ctx.__bbaFixed = true;
    var hint = ctx.hint;
    ctx.hint = function (t, m) { if (t === 0x8192 || t === 0x8B8B) return hint.call(ctx, t, m); };
    // GL_UNPACK_ROW_LENGTH is WebGL2-only. The emulation already remembers it (GL.unpackRowLength, used above), so on
    // WebGL1 just don't forward it, and answer glGetIntegerv for it from that.
    var gl2 = typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext;
    if (!gl2) {
      var store = ctx.pixelStorei, getp = ctx.getParameter;
      ctx.pixelStorei = function (p, v) { if (p === ROW_LENGTH) return; return store.call(ctx, p, v); };
      ctx.getParameter = function (p) { if (p === ROW_LENGTH) return rowLength(); return getp.call(ctx, p); };
    }
    // An RGB texture ignores the source alpha bit on desktop GL; RGBA bytes don't, so remember which textures were
    // made as RGB and fill their alpha in.
    var bound = null, rgb = new WeakSet(), bind = ctx.bindTexture;
    ctx.bindTexture = function (t, x) { if (t === ctx.TEXTURE_2D) bound = x; return bind.call(ctx, t, x); };
    var tex = ctx.texImage2D, sub = ctx.texSubImage2D;
    ctx.texImage2D = function (target, level, internal, w, h, border, format, type, pixels) {
      if (arguments.length === 9 && format === BGRA && (type === U1555R || type === U8888 || type === U8888R)) {
        var opaque = internal === 0x1907 || internal === 0x8051; // GL_RGB, GL_RGB8
        if (bound) { if (opaque) rgb.add(bound); else rgb.delete(bound); }
        var data = pixels ? toRGBA(pixels, w, h, type, rowLength(), opaque) : null;
        return plain(ctx, function () { tex.call(ctx, target, level, RGBA, w, h, border, RGBA, UBYTE, data); });
      }
      return tex.apply(ctx, arguments);
    };
    ctx.texSubImage2D = function (target, level, x, y, w, h, format, type, pixels) {
      if (arguments.length === 9 && format === BGRA && (type === U1555R || type === U8888 || type === U8888R) && pixels) {
        var data = toRGBA(pixels, w, h, type, rowLength(), !!bound && rgb.has(bound));
        return plain(ctx, function () { sub.call(ctx, target, level, x, y, w, h, RGBA, UBYTE, data); });
      }
      return sub.apply(ctx, arguments);
    };
  }
  // 5. The emulation's glDrawElements always reads client-side indices as 16-bit, but the renderer passes 32-bit
  //    (meshes, terrain) and 8-bit (2D quads) ones, which drew garbage (skewed HUD, missing ground). Repack those to
  //    16-bit in a small scratch block of wasm memory before the emulation sees them. This needs the import table,
  //    so play.js instantiates the wasm itself (Module.instantiateWasm) and calls this on the imports.
  var UINT = 0x1405, USHORT = 0x1403, UBYTE_IDX = 0x1401;
  var scratchPtr = 0, scratchCap = 0;
  function drawElementsFix(orig) {
    return function (mode, count, type, indices, start, end) {
      if ((type === UINT || type === UBYTE_IDX) && indices && count > 0 && !(GLctx && GLctx.currentElementArrayBufferBinding)) {
        if (scratchCap < count) { scratchCap = Math.max(count, scratchCap * 2, 4096); scratchPtr = _malloc(scratchCap * 2); }
        var dst = HEAPU16, d = scratchPtr >> 1, i;
        if (type === UINT) { var src32 = HEAPU32, s = indices >> 2; for (i = 0; i < count; i++) dst[d + i] = src32[s + i]; }
        else { var src8 = HEAPU8; for (i = 0; i < count; i++) dst[d + i] = src8[indices + i]; }
        return orig(mode, count, USHORT, scratchPtr, start, end);
      }
      return orig(mode, count, type, indices, start, end);
    };
  }
  // 6. The game starts "fullscreen", which in a browser means taking over the whole screen on the first click. In here
  //    it should stay in its 4:3 box inside the room, so the fullscreen request answers "not supported" and the
  //    game carries on windowed (the room has its own exit and the frame already fills the room).
  function noFullscreen() { return -1; } // EMSCRIPTEN_RESULT_NOT_SUPPORTED
  // 7. The renderer relies on GL_COLOR_MATERIAL (glColor sets the lit material's ambient + diffuse, including alpha),
  //    which the emulation's lighting shader ignores: see-through things (the time-portal rings, shields, fades) came
  //    out as solid grey. Mirror each glColor4f into the emulated material.
  function colorMaterialFix(orig) {
    return function (r, g, b, a) {
      orig(r, g, b, a);
      try {
        var cl = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
        var d = GLEmulation.materialDiffuse, am = GLEmulation.materialAmbient;
        if (d) { d[0] = cl(r); d[1] = cl(g); d[2] = cl(b); d[3] = cl(a); }
        if (am) { am[0] = cl(r); am[1] = cl(g); am[2] = cl(b); am[3] = cl(a); }
      } catch (e) { /* no emulation */ }
    };
  }
  window.__bbaPatchImports = function (imports) {
    var swaps = [];
    try { swaps.push([_glDrawElements, drawElementsFix]); } catch (e) { /* not in this build */ }
    try { swaps.push([_emscripten_glDrawElements, drawElementsFix]); } catch (e) { /* not in this build */ }
    try { swaps.push([_emscripten_request_fullscreen_strategy, function () { return noFullscreen; }]); } catch (e) { /* not in this build */ }
    try { swaps.push([_glColor4f, colorMaterialFix]); } catch (e) { /* not in this build */ }
    try { if (_emscripten_glColor4f !== _glColor4f) swaps.push([_emscripten_glColor4f, colorMaterialFix]); } catch (e) { /* not in this build */ }
    var n = 0;
    Object.keys(imports).forEach(function (m) {
      var mod = imports[m]; if (!mod || typeof mod !== 'object') return;
      Object.keys(mod).forEach(function (k) { for (var i = 0; i < swaps.length; i++) if (mod[k] === swaps[i][0]) { mod[k] = swaps[i][1](mod[k]); n++; break; } });
    });
    return n;
  };
  window.__bbaInstallWebGLFixes = function () {
    try {
      var mk = GL.makeContextCurrent, hooked = false;
      GL.makeContextCurrent = function (h) {
        var ok = mk.call(GL, h);
        if (ok && window.GLctx) {
          fixContext(GLctx);
          if (!hooked) { hooked = true; Browser.useWebGL = true; Browser.moduleContextCreatedCallbacks.forEach(function (cb) { cb(); }); }
        }
        return ok;
      };
    } catch (e) { /* a build without the emulation layer: nothing to patch */ }
  };
  window.__bbaToRGBA = toRGBA; // for the unit test
})();
