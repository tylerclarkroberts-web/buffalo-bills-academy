// EL HALO engine: one three.js scene (the town), a second tiny scene for the first-person gun, a fixed-ish game loop,
// and DOM HUD updates by ref (no React re-render per frame). Rules live in logic.js; this file moves things around.
import * as THREE from 'three';
import { buildWorld, terrain, BOUNDS, STEP, SPAWNS, PLAYER_START, PICADO } from './world.js';
import { makeAlebrije, makeLuchabot, makeHero, makeViewModels, makePinata, makePickup } from './models.js';
import * as L from './logic.js';
import { createAudio } from './audio.js';

const EYE = 1.62, RADIUS = 0.38, GRAV = 16, JUMP = 6.2, SPEED = 5.4;
const MARIGOLD = [[1, 0.6, 0.05], [1, 0.75, 0.1], [0.95, 0.45, 0.05]];

export function createGame({ canvas, root, touch = false, reduceMotion = false, muted = false, onMode = () => {} }) {
  const R = (() => { let s = (Date.now() & 0xffff) + 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 1.5));
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(touch ? 74 : 70, 1, 0.05, 420); camera.rotation.order = 'YXZ'; scene.add(camera);
  const world = buildWorld(scene, { lowEnd: touch });
  const COLL = world.colliders;

  // first-person gun in its own scene so it never clips into walls
  const vmScene = new THREE.Scene(), vmCam = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
  vmScene.add(new THREE.HemisphereLight(0xffd8b0, 0x5a3020, 2.2)); const vl = new THREE.DirectionalLight(0xffb070, 1.6); vl.position.set(-1, 1, 0.5); vmScene.add(vl);
  const vm = makeViewModels(); const vmRig = new THREE.Group(); vmScene.add(vmRig);
  vmRig.add(vm.rifle, vm.pistol, vm.flash); vm.pistol.visible = false;
  vm.rifle.scale.setScalar(0.6); vm.pistol.scale.setScalar(0.75);
  const VM_HOME = { rifle: new THREE.Vector3(0.17, -0.17, -0.42), pistol: new THREE.Vector3(0.16, -0.15, -0.36) };

  // the hero, for the title screen
  const hero = makeHero(); hero.position.set(0, 0, 8.6); scene.add(hero);

  // pooled effects: one Points cloud for confetti/dust/petals/sparks, a few tracers, a blast flash
  const PN = touch ? 500 : 900;
  const pGeo = new THREE.BufferGeometry(), pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const parts = Array.from({ length: PN }, () => ({ life: 0, vx: 0, vy: 0, vz: 0, drag: 0, g: 0 }));
  for (let i = 0; i < PN; i++) pPos[i * 3 + 1] = -999;
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: touch ? 0.16 : 0.13, vertexColors: true })); points.frustumCulled = false; scene.add(points);
  let pNext = 0;
  const emit = (x, y, z, n, colors, { speed = 4, up = 2, life = 1.2, g = 9, drag = 1.5 } = {}) => {
    for (let k = 0; k < n; k++) {
      const i = pNext; pNext = (pNext + 1) % PN; const p = parts[i], c = colors[k % colors.length];
      const a = R() * Math.PI * 2, e = (R() - 0.3) * Math.PI * 0.5, s = speed * (0.3 + R() * 0.7);
      p.vx = Math.cos(a) * Math.cos(e) * s; p.vz = Math.sin(a) * Math.cos(e) * s; p.vy = Math.sin(e) * s + up * R(); p.life = life * (0.5 + R() * 0.5); p.g = g; p.drag = drag;
      pPos.set([x, y, z], i * 3); pCol.set(c, i * 3);
    }
  };
  const tracers = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false })); m.visible = false; m.life = 0; scene.add(m); return m; });
  let trNext = 0;
  const flashGeo = new THREE.IcosahedronGeometry(1, 1);
  const blasts = [];

  const audio = (() => { try { return createAudio(); } catch { return null; } })();
  if (audio) audio.setMuted(muted);
  const sfx = (name, ...a) => { if (audio && !muted) try { audio[name](...a); } catch { /* sound is optional */ } };

  // ---- state
  let mode = 'title', t = 0, raf = 0, last = performance.now(), frames = 0, fps = 60, fpsT = 0, fpsN = 0;
  let P, pos, vy, onGround, yaw, pitch, enemies, queue, wave, score, kills, shots, spawnT, breakUntil, bolts, nades, pickups;
  let banner = { text: '', until: 0 }, shake = 0, vmKick = 0, swing = -1, swapAnim = 0, hurtFlash = 0, shieldFlash = 0, wasCharging = false, alarmT = 0, dirHit = null, bob = 0, emptyT = 0, deadT = 0;
  let frozen = false;
  let best = +(localStorage.getItem('bba.elhalo.best') || 0) || 0;
  const input = { keys: new Set(), fire: false, look: [0, 0], stick: [0, 0], edges: new Set() };

  function reset() {
    for (const e of enemies || []) scene.remove(e.m.root);
    for (const b of bolts || []) scene.remove(b.m);
    for (const g of nades || []) scene.remove(g.m);
    for (const p of pickups || []) scene.remove(p.m);
    P = L.createPlayer(); pos = { x: PLAYER_START.x, y: 0, z: PLAYER_START.z }; vy = 0; onGround = true; yaw = PLAYER_START.yaw; pitch = 0;
    enemies = []; queue = []; wave = 0; score = 0; kills = 0; shots = 0; spawnT = 0; breakUntil = 0; bolts = []; nades = []; pickups = [];
    t = 0; shake = 0; hurtFlash = 0; shieldFlash = 0; wasCharging = false; dirHit = null; deadT = 0;
    for (const [x, z] of [[-4.5, 4.5], [4.5, -4.5]]) addPickup('ammo', x, z, true);
    banner = { text: 'OLEADA 1', until: 2.2 }; breakUntil = 1.6;
    vm.rifle.visible = true; vm.pistol.visible = false;
  }

  // ---- world queries
  function groundAt(x, z, feet) {
    let h = terrain(x, z);
    for (const c of COLL) {
      if (c.r) { if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r && c.y1 <= feet + STEP && c.y1 > h) h = c.y1; }
      else if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && c.y1 <= feet + STEP && c.y1 > h) h = c.y1;
    }
    return h;
  }
  function collide(o, r, feet, height = 1.8) {
    for (const c of COLL) {
      if (c.y1 <= feet + STEP || c.y0 >= feet + height) continue;
      if (c.r) { const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-6) { o.x = c.x + dx / d * m; o.z = c.z + dz / d * m; } }
      else { const q = L.pushOut(o.x, o.z, r, c); if (q) { o.x = q.x; o.z = q.z; } }
    }
    o.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, o.x)); o.z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, o.z));
  }
  function wallDist(o, d, max) {
    let best = max;
    for (const c of COLL) {
      const b = c.r ? { x0: c.x - c.r * 0.8, x1: c.x + c.r * 0.8, z0: c.z - c.r * 0.8, z1: c.z + c.r * 0.8, y0: c.y0, y1: c.y1 } : c;
      const h = L.rayBox(o, d, b); if (h < best) best = h;
    }
    if (d.y < 0) for (let s = 0.4; s < best; s += 0.4) { if (o.y + d.y * s < terrain(o.x + d.x * s, o.z + d.z * s)) { best = s; break; } }
    return best;
  }
  const insideSolid = (p) => COLL.some((c) => (c.r ? (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < c.r * c.r : p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1) && p.y > c.y0 && p.y < c.y1);

  // ---- enemies
  function spawn(type) {
    const far = SPAWNS.map(([x, z]) => ({ x, z, d: Math.hypot(x - pos.x, z - pos.z) })).sort((a, b) => b.d - a.d).slice(0, 4);
    const s = far[Math.floor(R() * far.length)];
    const m = type === 'luchabot' ? makeLuchabot(R) : makeAlebrije(R, { big: type === 'jaguar' });
    const st = L.ENEMIES[type];
    const e = { type, m, st, x: s.x + (R() - 0.5) * 2, z: s.z + (R() - 0.5) * 2, y: 0, hp: st.hp, cool: 1 + R(), phase: R() * 6, seed: R() * 10, strafe: R() < 0.5 ? 1 : -1, strafeT: 0, flash: 0, dying: 0, detour: null, chk: { x: 0, z: 0, t: 0 } };
    e.y = groundAt(e.x, e.z, 0);
    m.root.position.set(e.x, e.y, e.z); scene.add(m.root);
    emit(e.x, e.y + 0.6, e.z, 26, MARIGOLD, { speed: 3, up: 3, life: 1.4, g: 4 });
    enemies.push(e);
  }
  const center = (e) => ({ x: e.x, y: e.y + e.st.height * (e.type === 'jaguar' ? 0.9 : 0.55), z: e.z });

  function hurtEnemy(e, dmg, how, from) {
    if (e.dying) return;
    e.hp -= dmg; e.flash = 1;
    sfx(e.type === 'luchabot' ? 'hitBot' : 'hitBeast');
    if (from) { const k = how === 'melee' ? 1.4 : how === 'grenade' ? 1 : 0.06; const dx = e.x - from.x, dz = e.z - from.z, d = Math.hypot(dx, dz) || 1; e.x += dx / d * k; e.z += dz / d * k; }
    if (e.hp > 0) return;
    e.dying = 0.45; kills++; score += L.killPoints(e.type, how);
    const c = center(e);
    sfx('die', e.type);
    emit(c.x, c.y, c.z, e.type === 'jaguar' ? 90 : 45, e.type === 'luchabot' ? [[0.8, 0.82, 0.86], [1, 0.8, 0.2], [1, 0.4, 0.2]] : [...PICADO, ...MARIGOLD], { speed: 5, up: 4, life: 1.6, g: 7 });
    const roll = R();
    if (roll < 0.34) addPickup('ammo', e.x, e.z); else if (roll < 0.46) addPickup('health', e.x, e.z); else if (roll < 0.56) addPickup('grenade', e.x, e.z);
  }

  function addPickup(kind, x, z, fixed = false) {
    const m = makePickup(kind); const y = groundAt(x, z, 5); m.position.set(x, y + 0.1, z); scene.add(m);
    pickups.push({ kind, m, x, z, y, life: fixed ? Infinity : 25, fixed, away: 0 });
  }

  // ---- player actions
  const fwd = () => new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  function eye() { return { x: pos.x, y: pos.y + EYE, z: pos.z }; }
  function muzzleWorld() { const f = fwd(); const r = { x: Math.cos(yaw), z: -Math.sin(yaw) }; const o = eye(); return { x: o.x + f.x * 0.5 + r.x * 0.16, y: o.y + f.y * 0.5 - 0.14, z: o.z + f.z * 0.5 + r.z * 0.16 }; }

  function shoot() {
    const w = L.WEAPONS[P.current];
    shots++; sfx(P.current); vmKick = 1; if (!reduceMotion) pitch = Math.min(1.45, pitch + (P.current === 'pistol' ? 0.012 : 0.005));
    const o = eye(), f = fwd();
    const s = w.spread * (onGround ? 1 : 1.6);
    const d = new THREE.Vector3(f.x + (R() - 0.5) * 2 * s, f.y + (R() - 0.5) * 2 * s, f.z + (R() - 0.5) * 2 * s).normalize();
    const wd = wallDist(o, d, 140);
    let hitE = null, hitD = wd, head = false;
    for (const e of enemies) {
      if (e.dying) continue;
      const c = center(e), r = e.st.radius * (touch ? 1.45 : 1.15) * (e.type === 'jaguar' ? 1.6 : 1);
      const h = L.raySphere(o, d, c, r); if (h < hitD) { hitD = h; hitE = e; head = false; }
      if (e.type === 'luchabot') { const hh = L.raySphere(o, d, { x: e.x, y: e.y + 1.92, z: e.z }, 0.3); if (hh < hitD) { hitD = hh; hitE = e; head = true; } }
    }
    const hp = { x: o.x + d.x * hitD, y: o.y + d.y * hitD, z: o.z + d.z * hitD };
    tracer(muzzleWorld(), hp);
    if (hitE) { hurtEnemy(hitE, w.damage * (head ? 1.7 : 1), 'gun', pos); emit(hp.x, hp.y, hp.z, 6, hitE.type === 'luchabot' ? [[1, 0.9, 0.5], [1, 1, 1]] : PICADO, { speed: 2.5, up: 1, life: 0.5 }); }
    else if (hitD < 140) emit(hp.x, hp.y, hp.z, 5, [[0.85, 0.7, 0.5], [0.7, 0.55, 0.4]], { speed: 1.5, up: 1.2, life: 0.6, g: 5 });
  }
  function tracer(a, b) {
    const m = tracers[trNext]; trNext = (trNext + 1) % tracers.length;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
    m.position.set(a.x + dx / 2, a.y + dy / 2, a.z + dz / 2); m.scale.set(1, 1, len); m.lookAt(b.x, b.y, b.z); m.visible = true; m.life = 0.05;
  }
  function throwNade() {
    if (!L.throwGrenade(P)) return;
    sfx('throw');
    const f = fwd(), o = eye();
    const m = makePinata(PICADO[Math.floor(R() * PICADO.length)]); scene.add(m);
    nades.push({ m, p: new THREE.Vector3(o.x + f.x * 0.6, o.y - 0.15 + f.y * 0.6, o.z + f.z * 0.6), v: new THREE.Vector3(f.x * 15, f.y * 15 + 4.5, f.z * 15), fuse: L.GRENADES.fuse });
  }
  function explode(p) {
    sfx('boom'); shake = Math.max(shake, 0.6);
    emit(p.x, p.y + 0.2, p.z, touch ? 110 : 170, [...PICADO, ...MARIGOLD, [1, 1, 1]], { speed: 9, up: 5, life: 2, g: 5, drag: 1.2 });
    const b = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, depthWrite: false })); b.position.copy(p); scene.add(b); blasts.push({ m: b, life: 0.3 });
    for (const e of enemies) { if (e.dying) continue; const c = center(e); const dmg = L.splash(Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z)); if (dmg > 0) hurtEnemy(e, dmg, 'grenade', p); }
    const pc = { x: pos.x, y: pos.y + 1, z: pos.z }; const self = Math.round(L.splash(Math.hypot(pc.x - p.x, pc.y - p.y, pc.z - p.z)) * 0.5);
    if (self > 0) hurtPlayer(self, p);
  }
  function melee() {
    if (!L.tryMelee(P, t)) return;
    swing = 0; sfx('whoosh');
    const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    let hit = false;
    for (const e of enemies) {
      if (e.dying) continue;
      const dx = e.x - pos.x, dz = e.z - pos.z, d = Math.hypot(dx, dz);
      if (d < L.MELEE.range + e.st.radius && (dx * f.x + dz * f.z) / (d || 1) > 0.45) { hurtEnemy(e, L.MELEE.damage, 'melee', pos); hit = true; }
    }
    if (hit) { sfx('smack'); shake = Math.max(shake, 0.25); }
  }
  function hurtPlayer(n, from, raw = false) {
    if (P.dead) return;
    const r = L.applyDamage(P, n * (touch && !raw ? 0.75 : 1), t);
    if (r.toShield > 0) { shieldFlash = 1; sfx('shieldHit'); }
    if (r.toHealth > 0) { hurtFlash = 1; sfx('hurt'); }
    if (r.shieldBroke) sfx('shieldDown');
    wasCharging = false;
    if (from) dirHit = { a: Math.atan2(from.x - pos.x, from.z - pos.z), life: 1 };
    if (r.dead) die();
  }
  function die() {
    mode = 'dead'; deadT = 0; sfx('death'); if (audio) audio.music(false);
    if (score > best) { best = score; localStorage.setItem('bba.elhalo.best', String(best)); }
    if (document.pointerLockElement) document.exitPointerLock?.();
    onMode('dead', { score, wave, kills, best });
  }

  // ---- input
  const PAD = touch;
  const onKeyDown = (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    if (mode !== 'playing') { if (k === 'Enter' && (mode === 'title' || mode === 'dead')) api.start(); return; }
    if (!input.keys.has(k)) input.edges.add(k);
    input.keys.add(k);
  };
  const onKeyUp = (e) => input.keys.delete(e.code);
  const onMouseMove = (e) => { if (document.pointerLockElement === canvas && mode === 'playing') { input.look[0] += e.movementX; input.look[1] += e.movementY; } };
  const onMouseDown = (e) => {
    if (PAD || e.button !== 0) return;
    if (mode === 'playing') { input.fire = true; if (document.pointerLockElement !== canvas) lock(); }
  };
  const onMouseUp = (e) => { if (e.button === 0) input.fire = false; };
  const onWheel = () => { if (mode === 'playing') input.edges.add('Swap'); };
  let lockedOnce = false, unlockAt = 0;
  const lock = () => { try { const r = canvas.requestPointerLock?.(); if (r?.catch) r.catch(() => {}); } catch { /* not allowed here */ } };
  const onLockChange = () => {
    if (document.pointerLockElement === canvas) { lockedOnce = true; return; }
    unlockAt = performance.now(); input.fire = false;
    if (mode === 'playing' && lockedOnce) pause();
  };
  const onVis = () => { if (document.hidden && mode === 'playing') pause(); };
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove); canvas.addEventListener('mousedown', onMouseDown); window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: true });
  document.addEventListener('pointerlockchange', onLockChange); document.addEventListener('visibilitychange', onVis);

  // touch pad: floating move stick on the left, drag anywhere else to look, buttons on the right
  const offs = [];
  const on = (el, ev, fn, opt) => { if (!el) return; el.addEventListener(ev, fn, opt); offs.push(() => el.removeEventListener(ev, fn, opt)); };
  const capture = (el, id) => { try { el?.setPointerCapture?.(id); } catch { /* the pointer already went away */ } };
  if (PAD) {
    const stickZone = root.querySelector('[data-pad=stick]'), knob = root.querySelector('[data-pad=knob]'), base = root.querySelector('[data-pad=base]');
    const lookZone = root.querySelector('[data-pad=look]');
    let sId = null, sx = 0, sy = 0; const lookers = new Map();
    const setKnob = (dx, dy) => { if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    on(stickZone, 'pointerdown', (e) => { e.preventDefault(); sId = e.pointerId; capture(stickZone, e.pointerId); const r = stickZone.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; if (base) { base.style.left = `${e.clientX - r.left}px`; base.style.top = `${e.clientY - r.top}px`; base.classList.add('on'); } setKnob(0, 0); });
    on(stickZone, 'pointermove', (e) => { if (e.pointerId !== sId) return; let dx = e.clientX - sx, dy = e.clientY - sy; const d = Math.hypot(dx, dy), M = 46; if (d > M) { dx = dx / d * M; dy = dy / d * M; } setKnob(dx, dy); input.stick = [dx / M, dy / M]; });
    const sEnd = (e) => { if (e.pointerId !== sId) return; sId = null; input.stick = [0, 0]; setKnob(0, 0); base?.classList.remove('on'); };
    on(stickZone, 'pointerup', sEnd); on(stickZone, 'pointercancel', sEnd);
    const lookStart = (e) => { lookers.set(e.pointerId, [e.clientX, e.clientY]); capture(e.currentTarget, e.pointerId); };
    const lookMove = (e) => { const p = lookers.get(e.pointerId); if (!p) return; input.look[0] += (e.clientX - p[0]) * 1.7; input.look[1] += (e.clientY - p[1]) * 1.7; lookers.set(e.pointerId, [e.clientX, e.clientY]); };
    const lookEnd = (e) => lookers.delete(e.pointerId);
    on(lookZone, 'pointerdown', (e) => { e.preventDefault(); lookStart(e); }); on(lookZone, 'pointermove', lookMove); on(lookZone, 'pointerup', lookEnd); on(lookZone, 'pointercancel', lookEnd);
    for (const b of root.querySelectorAll('[data-pad-btn]')) {
      const what = b.dataset.padBtn;
      on(b, 'pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); if (what === 'fire') { input.fire = true; lookStart(e); } else input.edges.add(what); });
      on(b, 'pointermove', (e) => { if (what === 'fire') lookMove(e); });
      const up = (e) => { b.classList.remove('on'); if (what === 'fire') { input.fire = false; lookEnd(e); } };
      on(b, 'pointerup', up); on(b, 'pointercancel', up); on(b, 'contextmenu', (e) => e.preventDefault());
    }
  }

  // ---- HUD by ref
  const H = {}; for (const el of root.querySelectorAll('[data-h]')) H[el.dataset.h] = el;
  const prev = {};
  const set = (k, prop, v) => { const key = k + prop; if (prev[key] === v || !H[k]) return; prev[key] = v; if (prop === 'text') H[k].textContent = v; else if (prop === 'w') H[k].style.transform = `scaleX(${v})`; else if (prop.startsWith('.')) H[k].classList.toggle(prop.slice(1), v); else if (prop === 'rot') H[k].style.transform = `rotate(${v}rad)`; else if (prop === 'op') H[k].style.opacity = v; };
  function hud() {
    const s = P.weapons[P.current], w = L.WEAPONS[P.current];
    set('shield', 'w', (P.shield / L.SHIELD.max).toFixed(3)); set('health', 'w', (P.health / L.HEALTH.max).toFixed(3));
    const down = P.shield <= 0.5, charging = P.shield < L.SHIELD.max && t - P.lastHit >= L.SHIELD.delay;
    set('bars', '.down', down && !charging); set('bars', '.charging', charging); set('bars', '.flash', shieldFlash > 0.5);
    set('bars', '.low', P.health < 35);
    set('mag', 'text', String(s.mag)); set('reserve', 'text', String(s.reserve)); set('wname', 'text', w.name);
    set('ammo', '.reloading', L.reloading(P, t)); set('ammo', '.empty', s.mag === 0 && s.reserve === 0);
    set('nades', 'text', '✶'.repeat(P.grenades) + '·'.repeat(L.GRENADES.max - P.grenades));
    set('score', 'text', score.toLocaleString()); set('wave', 'text', String(Math.max(1, wave)));
    set('banner', 'text', t < banner.until ? banner.text : ''); set('banner', '.on', t < banner.until);
    set('vig', '.hurt', hurtFlash > 0.15); set('vig', '.shield', shieldFlash > 0.15 && hurtFlash <= 0.15); set('vig', '.down', down && !P.dead);
    set('dir', 'op', dirHit ? dirHit.life.toFixed(2) : '0'); if (dirHit) set('dir', 'rot', (yaw - dirHit.a + Math.PI).toFixed(2));
    set('reticle', '.on', aimingAt()); set('reticle', '.pistol', P.current === 'pistol');
  }
  function aimingAt() {
    const o = eye(), d = fwd();
    for (const e of enemies) if (!e.dying && L.raySphere(o, d, center(e), e.st.radius * 1.3 * (e.type === 'jaguar' ? 1.6 : 1)) < 60) return true;
    return false;
  }

  // ---- the loop
  function update(dt) {
    t += dt;
    // look
    const sens = PAD ? 0.0042 : 0.0023;
    yaw -= input.look[0] * sens; pitch -= input.look[1] * sens; input.look[0] = input.look[1] = 0;
    if (input.keys.has('ArrowLeft')) yaw += 2.4 * dt; if (input.keys.has('ArrowRight')) yaw -= 2.4 * dt;
    pitch = Math.max(-1.45, Math.min(1.45, pitch));
    // move
    let mx = input.stick[0], mz = -input.stick[1];
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) mz += 1; if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) mz -= 1;
    if (input.keys.has('KeyD')) mx += 1; if (input.keys.has('KeyA')) mx -= 1;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    pos.x += (fx * mz + rx * mx) * SPEED * dt; pos.z += (fz * mz + rz * mx) * SPEED * dt;
    collide(pos, RADIUS, pos.y);
    for (const e of enemies) { if (e.dying) continue; const dx = pos.x - e.x, dz = pos.z - e.z, d = Math.hypot(dx, dz), m = RADIUS + e.st.radius * (e.type === 'jaguar' ? 1.6 : 1); if (d < m && d > 1e-4) { pos.x = e.x + dx / d * m; pos.z = e.z + dz / d * m; } }
    const jumpPressed = input.edges.has('Space') || input.edges.has('jump');
    if (jumpPressed && onGround) { vy = JUMP; onGround = false; }
    vy -= GRAV * dt; pos.y += vy * dt;
    const gy = groundAt(pos.x, pos.z, pos.y);
    if (pos.y <= gy) { pos.y = gy; vy = 0; onGround = true; } else if (pos.y - gy > 0.05) onGround = false;
    if (onGround && ml > 0.1 && !reduceMotion) bob += dt * 9; else bob *= 0.9;
    // weapons
    L.tickReload(P, t);
    if (input.edges.has('KeyR') || input.edges.has('reload')) { if (L.startReload(P, t)) sfx('reload'); }
    if (input.edges.has('KeyQ') || input.edges.has('Digit1') || input.edges.has('Digit2') || input.edges.has('Swap') || input.edges.has('swap')) {
      const want = input.edges.has('Digit1') ? 'rifle' : input.edges.has('Digit2') ? 'pistol' : null;
      if (!want || want !== P.current) { L.swapWeapon(P); swapAnim = 1; sfx('swap'); }
    }
    if (input.edges.has('KeyG') || input.edges.has('grenade')) throwNade();
    if (input.edges.has('KeyF') || input.edges.has('melee')) melee();
    const w = L.WEAPONS[P.current], s = P.weapons[P.current];
    if (input.fire && (w.auto || !input.fireHeld) && swing < 0) {
      const wasReloading = L.reloading(P, t);
      if (L.tryFire(P, t)) shoot();
      else if (s.mag === 0 && s.reserve === 0 && t > emptyT) { sfx('empty'); emptyT = t + 0.3; }
      else if (!wasReloading && L.reloading(P, t)) sfx('reload');
      if (!w.auto) input.fireHeld = true;
    }
    if (!input.fire) input.fireHeld = false;
    input.edges.clear();
    // shield
    const sh = L.tickShield(P, t, dt);
    if (sh === 'charging' && !wasCharging) { wasCharging = true; sfx('recharge'); }
    if (sh === 'full') wasCharging = false;
    if (P.shield <= 0.5 && !sh && t > alarmT) { sfx('alarm'); alarmT = t + 0.5; }
    // waves
    if (breakUntil > 0 && t >= breakUntil) { wave++; queue = L.waveRoster(wave).sort(() => R() - 0.5); breakUntil = 0; spawnT = t + 0.3; banner = { text: `OLEADA ${wave}`, until: t + 2 }; sfx('wave'); }
    if (breakUntil === 0 && queue.length && t >= spawnT && enemies.filter((e) => !e.dying).length < (PAD ? 7 : 10)) { spawn(queue.shift()); spawnT = t + 0.7; }
    if (breakUntil === 0 && wave > 0 && !queue.length && enemies.length === 0) {
      score += L.waveBonus(wave); L.addGrenade(P, 1);
      banner = { text: `¡OLEADA ${wave} LIMPIA! +${L.waveBonus(wave)}`, until: t + 3 }; breakUntil = t + 4; sfx('pickup');
    }
    // enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i], m = e.m;
      if (e.dying) { e.dying -= dt; m.root.scale.multiplyScalar(0.9); m.root.rotation.y += dt * 12; m.root.position.y += dt * 2; if (e.dying <= 0) { scene.remove(m.root); disposeTree(m.root); enemies.splice(i, 1); } continue; }
      const st = e.st; let dx = pos.x - e.x, dz = pos.z - e.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      let vx = 0, vz = 0, spd = st.speed;
      e.cool -= dt;
      if (e.type === 'luchabot') {
        e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe = -e.strafe; e.strafeT = 1.5 + R() * 2; }
        const sees = d < 40 && wallDist({ x: e.x, y: e.y + 1.6, z: e.z }, norm(pos.x - e.x, pos.y + 1.2 - e.y - 1.6, pos.z - e.z), d) >= d - 0.5;
        if (d > st.keep + 3 || !sees) { vx = dx; vz = dz; } else if (d < st.keep - 4) { vx = -dx * 0.8; vz = -dz * 0.8; } else { vx = -dz * e.strafe * 0.7; vz = dx * e.strafe * 0.7; }
        if (sees && !frozen && e.cool <= 0 && d < 34) { e.cool = st.boltEvery * (0.8 + R() * 0.5) * (PAD ? 1.2 : 1); boltFrom(e); }
        m.arms[1].rotation.x = sees ? -1.4 : Math.sin(e.phase) * 0.4; m.arms[0].rotation.x = -Math.sin(e.phase) * 0.4;
      } else {
        const reach = st.reach;
        if (d > reach * 0.85) { const z = e.type === 'alebrije' ? Math.sin(t * 3 + e.seed) * 0.35 : 0; vx = dx - dz * z; vz = dz + dx * z; if (e.type === 'jaguar' && d < 9 && e.cool < -1.5) { spd *= 2.4; } }
        else if (e.cool <= 0 && !frozen) { e.cool = st.biteEvery; hurtPlayer(st.bite, e); e.lunge = 0.25; }
      }
      if (e.detour) { e.detour.t -= dt; vx = e.detour.x; vz = e.detour.z; if (e.detour.t <= 0) e.detour = null; }
      const vl = Math.hypot(vx, vz); if (vl > 1) { vx /= vl; vz /= vl; }
      e.x += vx * spd * dt; e.z += vz * spd * dt;
      for (const o of enemies) { if (o === e || o.dying) continue; const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), mm = (e.st.radius + o.st.radius) * 0.9; if (od < mm && od > 1e-4) { e.x += ox / od * (mm - od) * 0.5; e.z += oz / od * (mm - od) * 0.5; } }
      const pd = Math.hypot(e.x - pos.x, e.z - pos.z), pm = RADIUS + st.radius * (e.type === 'jaguar' ? 1.6 : 1) * 0.95; if (pd < pm && pd > 1e-4) { e.x = pos.x + (e.x - pos.x) / pd * pm; e.z = pos.z + (e.z - pos.z) / pd * pm; }
      collide(e, st.radius * (e.type === 'jaguar' ? 1.4 : 1), e.y, st.height);
      e.y = groundAt(e.x, e.z, e.y);
      e.chk.t += dt;
      if (e.chk.t > 0.7) { const moved = Math.hypot(e.x - e.chk.x, e.z - e.chk.z); if (moved < 0.5 && vl > 0.3 && !e.detour) { const sgn = R() < 0.5 ? 1 : -1; e.detour = { x: -dz * sgn, z: dx * sgn, t: 0.9 }; } e.chk = { x: e.x, z: e.z, t: 0 }; }
      e.phase += dt * spd * 2.2 * (vl > 0.1 ? 1 : 0.2);
      m.root.position.set(e.x, e.y + (e.lunge > 0 ? 0.15 : 0), e.z); m.root.rotation.y = Math.atan2(-(pos.x - e.x), -(pos.z - e.z));
      m.legs.forEach((l, k) => { l.rotation.x = Math.sin(e.phase + (k % 2 ? Math.PI : 0) + (k > 1 && m.kind !== 'luchabot' ? Math.PI : 0)) * 0.6; });
      if (e.lunge > 0) { e.lunge -= dt; m.root.rotation.x = -0.25; } else m.root.rotation.x = 0;
      if (e.flash > 0) { e.flash = Math.max(0, e.flash - dt * 6); for (const mt of m.mats) mt.emissive.setScalar(e.flash * 0.7); }
    }
    // bolts
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.life -= dt; b.p.addScaledVector(b.v, dt); b.m.position.copy(b.p); b.m.rotation.y += dt * 10;
      const hitMe = Math.hypot(b.p.x - pos.x, (b.p.y - pos.y - 1.0) * 0.8, b.p.z - pos.z) < 0.6;
      if (hitMe) hurtPlayer(L.ENEMIES.luchabot.bolt, b.from);
      if (hitMe || b.life <= 0 || b.p.y < terrain(b.p.x, b.p.z) || insideSolid(b.p)) { if (!hitMe) emit(b.p.x, b.p.y, b.p.z, 6, [[1, 0.3, 0.8], [1, 0.8, 1]], { speed: 2, life: 0.4 }); scene.remove(b.m); bolts.splice(i, 1); }
    }
    // grenades
    for (let i = nades.length - 1; i >= 0; i--) {
      const g = nades[i]; g.fuse -= dt; const was = g.p.clone();
      g.v.y -= 18 * dt; g.p.addScaledVector(g.v, dt);
      const gy2 = terrain(g.p.x, g.p.z) + 0.12;
      const top = groundAt(g.p.x, g.p.z, was.y) + 0.12;
      if (g.p.y < Math.max(gy2, top)) { g.p.y = Math.max(gy2, top); g.v.y = Math.abs(g.v.y) * 0.35; g.v.x *= 0.6; g.v.z *= 0.6; }
      if (insideSolid(g.p)) { g.p.copy(was); g.v.x *= -0.4; g.v.z *= -0.4; }
      g.m.position.copy(g.p); g.m.rotation.x += dt * 8; g.m.rotation.z += dt * 5;
      if (g.fuse <= 0) { explode(g.p); scene.remove(g.m); nades.splice(i, 1); }
    }
    // pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (p.away > 0) { p.away -= dt; if (p.away <= 0) { p.m.visible = true; } continue; }
      p.life -= dt; p.m.rotation.y += dt * 1.6; p.m.position.y = p.y + 0.15 + Math.sin(t * 3 + i) * 0.08;
      if (Math.hypot(p.x - pos.x, p.z - pos.z) < 1.4 && Math.abs(p.y - pos.y) < 1.6) {
        let took = false;
        if (p.kind === 'ammo') { L.addAmmo(P, 'rifle', 64); L.addAmmo(P, 'pistol', 20); took = true; }
        else if (p.kind === 'health' && P.health < L.HEALTH.max) { L.heal(P, 40); took = true; }
        else if (p.kind === 'grenade') took = L.addGrenade(P, 1) > 0;
        if (took) { sfx('pickup'); emit(p.x, p.y + 0.4, p.z, 12, MARIGOLD, { speed: 2, up: 2, life: 0.7 }); if (p.fixed) { p.away = 25; p.m.visible = false; continue; } scene.remove(p.m); pickups.splice(i, 1); continue; }
      }
      if (p.life <= 0) { scene.remove(p.m); pickups.splice(i, 1); }
    }
    hurtFlash = Math.max(0, hurtFlash - dt * 2.5); shieldFlash = Math.max(0, shieldFlash - dt * 3);
    if (dirHit) { dirHit.life -= dt; if (dirHit.life <= 0) dirHit = null; }
  }
  const norm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return { x: x / l, y: y / l, z: z / l }; };
  function boltFrom(e) {
    sfx('bolt');
    const o = new THREE.Vector3(e.x + Math.cos(Math.atan2(-(pos.x - e.x), -(pos.z - e.z))) * 0.42, e.y + 1.1, e.z);
    const aim = new THREE.Vector3(pos.x + (R() - 0.5) * 1.4, pos.y + 1.1 + (R() - 0.5) * 0.8, pos.z + (R() - 0.5) * 1.4).sub(o).normalize().multiplyScalar(L.ENEMIES.luchabot.boltSpeed * (PAD ? 0.8 : 1));
    const m = new THREE.Mesh(boltGeo, boltMat); m.position.copy(o); scene.add(m);
    bolts.push({ m, p: o, v: aim, life: 3, from: { x: e.x, z: e.z } });
  }
  const boltGeo = new THREE.OctahedronGeometry(0.14, 0), boltMat = new THREE.MeshBasicMaterial({ color: 0xff40c0 });

  function effects(dt) {
    for (let i = 0; i < PN; i++) {
      const p = parts[i]; if (p.life <= 0) continue;
      p.life -= dt; if (p.life <= 0) { pPos[i * 3 + 1] = -999; continue; }
      const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.g * dt;
      pPos[i * 3] += p.vx * dt; pPos[i * 3 + 1] += p.vy * dt; pPos[i * 3 + 2] += p.vz * dt;
      const gy = terrain(pPos[i * 3], pPos[i * 3 + 2]); if (pPos[i * 3 + 1] < gy + 0.03) { pPos[i * 3 + 1] = gy + 0.03; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    for (const tr of tracers) if (tr.visible) { tr.life -= dt; if (tr.life <= 0) tr.visible = false; }
    for (let i = blasts.length - 1; i >= 0; i--) { const b = blasts[i]; b.life -= dt; b.m.scale.setScalar(1 + (0.3 - b.life) * 14); b.m.material.opacity = Math.max(0, b.life / 0.3) * 0.8; if (b.life <= 0) { scene.remove(b.m); b.m.material.dispose(); blasts.splice(i, 1); } }
    world.picado.rotation.y = 0; world.water.material.emissive.setRGB(0.04, 0.2 + Math.sin(performance.now() / 400) * 0.04, 0.25);
  }

  function placeCamera(dt) {
    if (mode === 'title') {
      const a = performance.now() / 6000;
      camera.position.set(hero.position.x + Math.sin(a) * 4.4, 2.1, hero.position.z + Math.cos(a) * 4.4 - 0.2);
      camera.lookAt(hero.position.x, 1.55, hero.position.z); hero.visible = true; return;
    }
    hero.visible = false;
    const sh = reduceMotion ? 0 : shake; shake = Math.max(0, shake - dt * 2);
    const by = Math.sin(bob) * 0.04, bx = Math.cos(bob * 0.5) * 0.03;
    camera.position.set(pos.x + (R() - 0.5) * sh * 0.2, pos.y + EYE + by + (R() - 0.5) * sh * 0.2 - (mode === 'dead' ? Math.min(1.2, deadT * 1.5) : 0), pos.z);
    camera.rotation.set(pitch, yaw, mode === 'dead' ? Math.min(0.6, deadT) : 0);
    // gun
    const cur = P.current, home = VM_HOME[cur];
    vm.rifle.visible = cur === 'rifle'; vm.pistol.visible = cur === 'pistol';
    vmKick = Math.max(0, vmKick - dt * 14); swapAnim = Math.max(0, swapAnim - dt * 4);
    const rl = L.reloading(P, t) ? Math.sin(Math.min(1, (P.weapons[cur].reloadUntil - t) / L.WEAPONS[cur].reload) * Math.PI) : 0;
    let sw = 0; if (swing >= 0) { swing += dt; sw = Math.sin(Math.min(1, swing / 0.3) * Math.PI); if (swing > 0.3) swing = -1; }
    const g = vm[cur]; g.position.set(home.x + bx * 0.5 - sw * 0.12, home.y + by * 0.5 - rl * 0.18 - swapAnim * 0.3, home.z + vmKick * 0.05 - sw * 0.25);
    g.rotation.set(rl * 0.5 + vmKick * 0.06 - sw * 0.4, 0.06 + sw * 0.6, rl * 0.3);
    vm.flash.visible = vmKick > 0.6; if (vm.flash.visible) { g.updateMatrix(); vm.flash.position.copy(vm.muzzle[cur]).applyMatrix4(g.matrix); vm.flash.rotation.set(0, g.rotation.y, R() * 3); }
    vmRig.visible = mode !== 'dead';
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    fpsT += dt; fpsN++; if (fpsT >= 1) { fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
    if (mode === 'playing') update(dt);
    if (mode === 'dead') deadT += dt;
    if (mode !== 'paused') effects(dt);
    placeCamera(dt);
    resize();
    renderer.clear(); renderer.render(scene, camera);
    if (mode === 'playing' || mode === 'paused') { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
    if (P && (mode === 'playing' || mode === 'dead' || mode === 'paused')) hud();
    frames++;
  }
  let W = 0, Hh = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h || (w === W && h === Hh)) return; W = w; Hh = h;
    renderer.setSize(w, h, false);
    // keep a usable sideways view on tall phones: widen the vertical field of view as the screen narrows
    const a = w / h, deg = Math.PI / 180, base = touch ? 74 : 70;
    camera.aspect = a; camera.fov = a >= 1 ? base : Math.min(98, 2 * Math.atan(Math.tan(36 * deg) / a) / deg); camera.updateProjectionMatrix();
    vmCam.aspect = a; vmCam.fov = a >= 1 ? 55 : 2 * Math.atan(Math.tan(31 * deg) / a) / deg; vmCam.updateProjectionMatrix();
  }
  function pause() { if (mode !== 'playing') return; mode = 'paused'; input.fire = false; input.keys.clear(); if (audio) audio.music(false); onMode('paused', { score, wave }); }
  function disposeTree(o) { o.traverse((c) => { if (c.geometry) c.geometry.dispose(); }); }

  reset(); hero.visible = true; onMode('title', { best });
  raf = requestAnimationFrame(frame);

  const api = {
    start() { reset(); mode = 'playing'; last = performance.now(); if (audio) { audio.resume(); audio.music(true); } if (!PAD) lock(); onMode('playing', {}); },
    resume() { if (mode !== 'paused') return; mode = 'playing'; last = performance.now(); if (audio) { audio.resume(); audio.music(true); } if (!PAD) lock(); onMode('playing', {}); },
    pause,
    get mode() { return mode; },
    justUnlocked: () => performance.now() - unlockAt < 400,
    locked: () => document.pointerLockElement === canvas,
    setMuted(m) { muted = m; if (audio) { audio.setMuted(m); if (!m && mode === 'playing') audio.music(true); } },
    // read-outs + a couple of hooks for the browser checks (free play; nothing here touches money or the server)
    state: () => ({ mode, wave, score, kills, shots, fps: Math.round(fps), frames, shield: Math.round(P.shield), health: Math.round(P.health), grenades: P.grenades,
      weapon: P.current, mag: P.weapons[P.current].mag, reserve: P.weapons[P.current].reserve, pos: { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2) }, yaw: +yaw.toFixed(3),
      enemies: enemies.filter((e) => !e.dying).length, nearest: +Math.min(999, ...enemies.filter((e) => !e.dying).map((e) => Math.hypot(e.x - pos.x, e.z - pos.z))).toFixed(1), sinceHit: +(t - P.lastHit).toFixed(2), audio: audio ? audio.ctx.state : 'none' }),
    hurt: (n) => hurtPlayer(n, null, true),
    aimAtNearest() { const e = enemies.filter((x) => !x.dying).sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z))[0]; if (!e) return false; const c = center(e), o = eye(); yaw = Math.atan2(-(c.x - o.x), -(c.z - o.z)); pitch = Math.atan2(c.y - o.y, Math.hypot(c.x - o.x, c.z - o.z)); return true; },
    freeze: (on) => { frozen = !!on; for (const b of bolts) b.life = 0; },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown); window.removeEventListener('mouseup', onMouseUp); canvas.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onLockChange); document.removeEventListener('visibilitychange', onVis);
      offs.forEach((f) => f());
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      if (audio) audio.close();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose(); x.dispose(); }); });
      vmScene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      renderer.dispose();
    },
  };
  return api;
}
