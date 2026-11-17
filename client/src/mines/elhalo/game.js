// EL HALO engine (horde): one three.js scene (the canyon), a second tiny scene for the first-person gun, and DOM HUD
// updates by ref (no React re-render per frame). The match itself runs on the server (server/elhalo/match.js): this
// file predicts your own movement and gun, draws everyone else smoothly between the server's ~10 updates a second,
// and turns the server's events into confetti, sounds and HUD. Free play: nothing here touches money.
import * as THREE from 'three';
import { buildWorld, terrain, PICADO } from './world.js';
import { ENEMY_MAKERS, makeViewModels, makePinata, makePickup, makePlayerModel, makeNote, PLAYER_COLORS } from './models.js';
import * as L from './logic.js';
import { BOUNDS, OPENINGS, BOARDS_MAX, groundAt, collide, wallDist } from '../../../../server/elhalo/map.js';
import { createAudio } from './audio.js';
import { connect, join, leave, inputSender } from './net.js';

const EYE = 1.62, RADIUS = 0.38, GRAV = 16, JUMP = 6.2, SPEED = 5.4;
const TYPES = L.ENEMY_TYPES;
const NAME = { luchador: 'LUCHADOR', mariachi: 'MARIACHI', granjero: 'GRANJERO', padre: 'PADRE' };
const ST = ['walk', 'hit', 'tear', 'tackle', 'shoot', 'bless', 'idle'];
const MARIGOLD = [[1, 0.6, 0.05], [1, 0.75, 0.1], [0.95, 0.45, 0.05]];
const GOLD = [[1, 0.9, 0.4], [1, 1, 0.8], [1, 0.8, 0.2]];
const WOOD = [[0.62, 0.42, 0.24], [0.5, 0.33, 0.18], [0.75, 0.55, 0.35]];
const SEND_MS = 100;

export function createGame({ canvas, root, touch = false, reduceMotion = false, muted = false, onMode = () => {}, onInfo = () => {} }) {
  const R = (() => { let s = (Date.now() & 0xffff) + 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 1.5));
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(touch ? 74 : 70, 1, 0.05, 460); camera.rotation.order = 'YXZ'; scene.add(camera);
  const world = buildWorld(scene, { lowEnd: touch });

  // first-person gun in its own scene so it never clips into walls
  const vmScene = new THREE.Scene(), vmCam = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
  vmScene.add(new THREE.HemisphereLight(0xffd8b0, 0x5a3020, 2.2)); const vl = new THREE.DirectionalLight(0xffb070, 1.6); vl.position.set(-1, 1, 0.5); vmScene.add(vl);
  const vm = makeViewModels(); const vmRig = new THREE.Group(); vmScene.add(vmRig);
  vmRig.add(vm.rifle, vm.pistol, vm.flash); vm.pistol.visible = false;
  vm.rifle.scale.setScalar(0.6); vm.pistol.scale.setScalar(0.75);
  const VM_HOME = { rifle: new THREE.Vector3(0.17, -0.17, -0.42), pistol: new THREE.Vector3(0.16, -0.15, -0.36) };

  // pooled effects: one Points cloud for confetti/dust/petals/sparks, tracers, blast flashes
  const PN = touch ? 600 : 1100;
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
  const tracers = Array.from({ length: 16 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false })); m.visible = false; m.life = 0; scene.add(m); return m; });
  let trNext = 0;
  const flashGeo = new THREE.IcosahedronGeometry(1, 1);
  const blasts = [];

  const audio = (() => { try { return createAudio(); } catch { return null; } })();
  if (audio) audio.setMuted(muted);
  const sfx = (name, ...a) => { if (audio && !muted) try { audio[name](...a); } catch { /* sound is optional */ } };
  const near = (x, z, r = 28) => Math.hypot(x - pos.x, z - pos.z) < r;

  // ---- local state
  let mode = 'loading', t = 0, raf = 0, last = performance.now(), frames = 0, fps = 60, fpsT = 0, fpsN = 0;
  let P = L.createPlayer(), pos = { x: 0, y: 2, z: 0 }, vy = 0, onGround = true, yaw = 0, pitch = 0;
  let banner = { text: '', until: 0 }, shake = 0, vmKick = 0, swing = -1, swapAnim = 0, hurtFlash = 0, shieldFlash = 0, alarmT = 0, dirHit = null, bob = 0, emptyT = 0, hitMark = 0;
  let overview = false, autopilot = null;
  const input = { keys: new Set(), fire: false, fireHeld: false, act: false, look: [0, 0], stick: [0, 0], edges: new Set() };

  // ---- the shared world as the server last told us
  let snap = null, me = null, myId = null, joined = false, joining = false, lastAg = null, lastSnapAt = 0, prevSt = null, prevPhase = null, prevWave = 0, nadesSpent = 0;
  let pending = [], sendT = 0, status = 'connecting', infoKey = '';
  const bars = OPENINGS.map(() => BOARDS_MAX);
  const ents = { en: new Map(), pl: new Map(), pj: new Map(), gr: new Map(), pk: new Map() };
  const dying = [];
  const sender = inputSender();
  const lerpTo = (o, x, y, z, yw, now, dur) => {
    if (o.to) { const k = Math.min(1, (now - o.t0) / o.dur); o.from = { x: o.from.x + (o.to.x - o.from.x) * k, y: o.from.y + (o.to.y - o.from.y) * k, z: o.from.z + (o.to.z - o.from.z) * k, yaw: angLerp(o.from.yaw, o.to.yaw, k) }; }
    else o.from = { x, y, z, yaw: yw };
    o.to = { x, y, z, yaw: yw }; o.t0 = now; o.dur = dur;
  };
  const cur = (o, now) => { const k = Math.min(1, (now - o.t0) / o.dur); return { x: o.from.x + (o.to.x - o.from.x) * k, y: o.from.y + (o.to.y - o.from.y) * k, z: o.from.z + (o.to.z - o.from.z) * k, yaw: angLerp(o.from.yaw, o.to.yaw, k) }; };

  function onSnap(msg) {
    const s = msg.s, now = performance.now();
    const dur = Math.max(60, Math.min(250, lastSnapAt ? now - lastSnapAt : 100)); lastSnapAt = now;
    me = msg.me; myId = me.id; snap = s;
    // enemies
    const seen = new Set();
    for (const r of s.en) {
      const [id, ti, x, y, z, yw, hp, st, flash, haste] = r; seen.add(id);
      let e = ents.en.get(id);
      if (!e) {
        const type = TYPES[ti]; const m = ENEMY_MAKERS[type](R); m.root.position.set(x, y, z); m.root.rotation.y = yw; scene.add(m.root);
        e = { id, type, m, phase: R() * 6, seed: R() * 10 }; ents.en.set(id, e);
        if (mode !== 'loading') emit(x, y + 0.8, z, 20, MARIGOLD, { speed: 3, up: 3, life: 1.2, g: 4 });
      }
      lerpTo(e, x, y, z, yw, now, dur); e.hp = hp; e.st = ST[st] || 'walk'; if (flash) e.flash = 1; e.haste = haste;
    }
    for (const [id, e] of ents.en) if (!seen.has(id)) { ents.en.delete(id); const c = cur(e, now); dying.push({ m: e.m, life: 0.45, x: c.x, y: c.y, z: c.z }); }
    // players (yourself is the camera, not a model)
    const seenP = new Set();
    for (const r of s.pl) {
      const [id, name, x, y, z, yw, pt, flags, , , , , , , color] = r;
      if (id === myId || (flags & 8)) continue; seenP.add(id);
      let p = ents.pl.get(id);
      if (!p) { const m = makePlayerModel(color, name); m.root.position.set(x, y, z); scene.add(m.root); p = { id, name, m, phase: 0 }; ents.pl.set(id, p); }
      lerpTo(p, x, y, z, yw, now, dur); p.flags = flags; p.pitch = pt;
    }
    for (const [id, p] of ents.pl) if (!seenP.has(id)) { scene.remove(p.m.root); disposeTree(p.m.root); ents.pl.delete(id); }
    // notes, grenades, pickups
    syncSimple(ents.pj, s.pj, () => { const m = makeNote(); scene.add(m); return m; }, now, dur);
    syncSimple(ents.gr, s.gr, () => { const m = makePinata(PICADO[Math.floor(R() * PICADO.length)]); scene.add(m); return m; }, now, dur);
    const seenK = new Set();
    for (const [id, kind, x, y, z] of s.pk) { seenK.add(id); if (!ents.pk.has(id)) { const m = makePickup(kind); m.position.set(x, y + 0.1, z); scene.add(m); ents.pk.set(id, { m, y }); } }
    for (const [id, k] of ents.pk) if (!seenK.has(id)) { scene.remove(k.m); disposeTree(k.m); ents.pk.delete(id); }
    // boards
    s.bd.forEach((n, i) => {
      if (n < bars[i]) { const o = OPENINGS[i]; for (let k = n; k < bars[i]; k++) emit(o.x, o.y0 + 0.4 + k * 0.3, o.z, 8, WOOD, { speed: 3, up: 2, life: 0.9 }); }
      bars[i] = n; const b = world.boards[i];
      if (b.shown !== n) { b.planks.forEach((pl, k) => { pl.visible = k < n; }); b.shown = n; }
    });
    // you
    if (me.in) {
      P.shield = me.sh; P.health = me.hp; P.grenades = me.gr; nadesSpent = 0;
      if (lastAg === null) lastAg = me.ag;
      if (me.ag > lastAg) { for (let k = lastAg; k < me.ag; k++) { L.addAmmo(P, 'rifle', 64); L.addAmmo(P, 'pistol', 20); } lastAg = me.ag; }
      if (me.corr) { pos.x = me.corr[0]; pos.y = me.corr[1]; pos.z = me.corr[2]; vy = 0; if (me.corr.length > 3) { yaw = me.corr[3]; pitch = 0; } }
      if (prevSt && prevSt !== me.st) {
        if (me.st === 'downed') { sfx('shieldDown'); banner = { text: '¡CAÍSTE!', until: t + 2 }; }
        if (me.st === 'alive' && prevSt !== 'alive') { P = Object.assign(L.createPlayer(), { shield: me.sh, health: me.hp, grenades: me.gr }); banner = { text: prevSt === 'downed' ? '¡DE PIE!' : '¡OTRA VEZ!', until: t + 1.6 }; sfx('pickup'); }
      }
      prevSt = me.st;
      if (!joined && !joining) { joined = true; }
    } else if (joined && !joining) { joined = false; prevSt = null; if (mode === 'playing' || mode === 'paused') setMode('title'); }
    for (const e of s.ev) event(e);
    if (prevPhase !== s.ph || prevWave !== s.wv) { prevPhase = s.ph; prevWave = s.wv; }
    if (mode === 'loading') setMode('title');
    info();
  }
  function syncSimple(map, rows, make, now, dur) {
    const seen = new Set();
    for (const [id, x, y, z] of rows) { seen.add(id); let o = map.get(id); if (!o) { o = { m: make() }; o.m.position.set(x, y, z); map.set(id, o); } lerpTo(o, x, y, z, 0, now, dur); }
    for (const [id, o] of map) if (!seen.has(id)) { scene.remove(o.m); disposeTree(o.m); map.delete(id); }
  }
  const nameOf = (id) => (snap?.pl.find((r) => r[0] === id)?.[1]) || '?';
  function event(e) {
    const k = e[0];
    if (k === 's') { if (e[1] !== myId) { tracer({ x: e[2], y: e[3] - 0.15, z: e[4] }, { x: e[5], y: e[6], z: e[7] }); if (e[8]) emit(e[5], e[6], e[7], 4, PICADO, { speed: 2, life: 0.4 }); if (near(e[2], e[4], 22)) sfx('rifle'); } }
    else if (k === 'hm') { if (e[1] === myId) { hitMark = 0.15; sfx('hitmark'); } }
    else if (k === 'k') {
      const type = TYPES[e[2]];
      emit(e[3], e[4] + 1, e[5], 55, type === 'padre' ? [...GOLD, ...MARIGOLD] : [...PICADO, ...MARIGOLD], { speed: 5, up: 4, life: 1.6, g: 7 });
      if (near(e[3], e[5], 40)) sfx('die', type === 'luchador' ? 'beast' : 'x');
      if (e[6]) feed(`${e[6] === myId ? 'TÚ' : nameOf(e[6])} ✶ ${NAME[type]}${e[7] === 'melee' ? ' (¡ZAS!)' : e[7] === 'grenade' ? ' (PIÑATA)' : ''}`, e[6] === myId);
    }
    else if (k === 'x') { explode(e[1], e[2], e[3]); }
    else if (k === 'h') {
      if (e[1] !== myId) return;
      if (e[5]) { shieldFlash = 1; sfx('shieldHit'); } else { hurtFlash = 1; sfx('hurt'); }
      if (e[6]) sfx('shieldDown');
      if (e[2] !== null) dirHit = { a: Math.atan2(e[2] - pos.x, e[3] - pos.z), life: 1 };
    }
    else if (k === 'pvp') feed(`${e[1] === myId ? 'TÚ' : nameOf(e[1])} ➜ ${e[2] === myId ? 'TÚ' : nameOf(e[2])}`, e[1] === myId || e[2] === myId, 'pvp');
    else if (k === 'dn') feed(`${e[1] === myId ? 'TÚ' : nameOf(e[1])} CAYÓ`, e[1] === myId);
    else if (k === 'rv') feed(`${nameOf(e[2])} LEVANTÓ A ${e[1] === myId ? 'TI' : nameOf(e[1])}`, e[1] === myId || e[2] === myId);
    else if (k === 'j') feed(`${e[2]} ENTRÓ`);
    else if (k === 'l') feed(`${nameOf(e[1])} SALIÓ`);
    else if (k === 'bb') { const o = OPENINGS[e[1]]; if (near(o.x, o.z, 24)) sfx('crack'); }
    else if (k === 'br') { const o = OPENINGS[e[1]]; if (near(o.x, o.z, 24)) sfx('hammer'); emit(o.x, o.y0 + 1, o.z, 6, WOOD, { speed: 1.5, up: 1, life: 0.5 }); }
    else if (k === 'pk') { if (e[2] === myId) sfx('pickup'); }
    else if (k === 'wave') { banner = { text: `OLEADA ${e[1]}`, until: t + 2.4 }; sfx('wave'); }
    else if (k === 'clear') { banner = { text: `¡OLEADA ${e[1]} LIMPIA!`, until: t + 3 }; sfx('pickup'); }
    else if (k === 'over') { banner = { text: '', until: 0 }; sfx('death'); }
    else if (k === 'new') { banner = { text: 'OTRA RONDA', until: t + 2 }; }
    else if (k === 'bl') { const en = ents.en.get(e[1]); if (en) { const c = cur(en, performance.now()); emit(c.x, c.y + 2.2, c.z, 30, GOLD, { speed: 3, up: 1, life: 1.2, g: -1, drag: 2 }); if (near(c.x, c.z, 25)) sfx('bless'); } }
    else if (k === 'nt') { const en = ents.en.get(e[1]); if (en && near(en.to.x, en.to.z, 30)) sfx('bolt'); }
    else if (k === 'tk') { const en = ents.en.get(e[1]); if (en && near(en.to.x, en.to.z, 20)) sfx('whoosh'); }
    else if (k === 'ml') { if (e[1] !== myId) { const p = ents.pl.get(e[1]); if (p && near(p.to.x, p.to.z, 15)) sfx('whoosh'); } }
    else if (k === 'g') { if (e[1] !== myId) sfx('throw'); }
    else if (k === 'buy') { if (e[1] === myId) { sfx('pickup'); banner = { text: e[2] === 'ammo' ? '¡PARQUE!' : '¡PIÑATAS!', until: t + 1.2 }; } }
    else if (k === 'broke') { if (e[1] === myId) { sfx('empty'); banner = { text: 'NO TE ALCANZA', until: t + 1.2 }; } }
  }
  function feed(text, mine = false, cls = '') {
    const f = H.feed; if (!f) return;
    const d = document.createElement('div'); d.textContent = text; d.className = `${mine ? 'me' : ''} ${cls}`.trim();
    f.appendChild(d); while (f.children.length > 5) f.removeChild(f.firstChild);
    setTimeout(() => d.remove(), 5000);
  }
  function info() {
    if (!snap) return;
    const online = snap.pl.filter((r) => !(r[7] & 8));
    const i = { players: online.length, names: online.map((r) => r[1]), wave: snap.wv, phase: snap.ph, cd: snap.cd, joined, st: me?.st, last: snap.last || null, status };
    const key = JSON.stringify(i);
    if (key !== infoKey) { infoKey = key; onInfo(i); }
  }
  const setMode = (m, extra = {}) => { mode = m; onMode(m, extra); };

  // ---- world queries for your own movement
  const fwd = () => new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const eye = () => ({ x: pos.x, y: pos.y + EYE, z: pos.z });
  function muzzleWorld() { const f = fwd(); const r = { x: Math.cos(yaw), z: -Math.sin(yaw) }; const o = eye(); return { x: o.x + f.x * 0.5 + r.x * 0.16, y: o.y + f.y * 0.5 - 0.14, z: o.z + f.z * 0.5 + r.z * 0.16 }; }
  const enemyCenter = (e, now) => { const c = cur(e, now); return { x: c.x, y: c.y + L.ENEMIES[e.type].height * 0.5, z: c.z }; };

  function shoot() {
    const w = L.WEAPONS[P.current], now = performance.now();
    sfx(P.current); vmKick = 1; if (!reduceMotion) pitch = Math.min(1.45, pitch + (P.current === 'pistol' ? 0.012 : 0.005));
    const o = eye(), f = fwd();
    const s = w.spread * (onGround ? 1 : 1.6);
    const d = new THREE.Vector3(f.x + (R() - 0.5) * 2 * s, f.y + (R() - 0.5) * 2 * s, f.z + (R() - 0.5) * 2 * s).normalize();
    const wd = wallDist(o, d, 140, bars);
    let hitD = wd, hit = false;
    for (const e of ents.en.values()) { const h = L.raySphere(o, d, enemyCenter(e, now), L.ENEMIES[e.type].radius * 1.4); if (h < hitD) { hitD = h; hit = true; } }
    for (const p of ents.pl.values()) { if (p.flags & 14) continue; const c = cur(p, now); const h = L.raySphere(o, d, { x: c.x, y: c.y + 1, z: c.z }, 0.52); if (h < hitD) { hitD = h; hit = true; } }
    const hp = { x: o.x + d.x * hitD, y: o.y + d.y * hitD, z: o.z + d.z * hitD };
    tracer(muzzleWorld(), hp);
    if (hit) emit(hp.x, hp.y, hp.z, 6, PICADO, { speed: 2.5, up: 1, life: 0.5 });
    else if (hitD < 140) emit(hp.x, hp.y, hp.z, 5, [[0.85, 0.7, 0.5], [0.7, 0.55, 0.4]], { speed: 1.5, up: 1.2, life: 0.6, g: 5 });
    pending.push(['s', +o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2), +d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4)]);
  }
  function tracer(a, b) {
    const m = tracers[trNext]; trNext = (trNext + 1) % tracers.length;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
    m.position.set(a.x + dx / 2, a.y + dy / 2, a.z + dz / 2); m.scale.set(1, 1, Math.max(0.01, len)); m.lookAt(b.x, b.y, b.z); m.visible = true; m.life = 0.05;
  }
  function throwNade() {
    if (P.grenades - nadesSpent <= 0) return;
    nadesSpent++; sfx('throw');
    const o = eye(); pending.push(['g', +o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2)]);
  }
  function explode(x, y, z) {
    if (near(x, z, 45)) sfx('boom');
    const dd = Math.hypot(x - pos.x, z - pos.z); shake = Math.max(shake, Math.max(0, 0.7 - dd / 25));
    emit(x, y + 0.2, z, touch ? 110 : 170, [...PICADO, ...MARIGOLD, [1, 1, 1]], { speed: 9, up: 5, life: 2, g: 5, drag: 1.2 });
    const b = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, depthWrite: false })); b.position.set(x, y, z); scene.add(b); blasts.push({ m: b, life: 0.3 });
  }
  function melee() {
    if (!L.tryMelee(P, t)) return;
    swing = 0; sfx('whoosh'); pending.push(['m']);
  }

  // ---- input
  const PAD = touch;
  const onKeyDown = (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.code;
    if (mode === 'playing' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
    if (mode !== 'playing') { if (k === 'Enter' && mode === 'title') api.start(); return; }
    if (!input.keys.has(k)) input.edges.add(k);
    input.keys.add(k);
  };
  const onKeyUp = (e) => input.keys.delete(e.code);
  const onMouseMove = (e) => { if (document.pointerLockElement === canvas && mode === 'playing') { input.look[0] += e.movementX; input.look[1] += e.movementY; } };
  const onMouseDown = (e) => { if (PAD || e.button !== 0) return; if (mode === 'playing') { input.fire = true; if (document.pointerLockElement !== canvas) lock(); } };
  const onMouseUp = (e) => { if (e.button === 0) input.fire = false; };
  const onWheel = () => { if (mode === 'playing') input.edges.add('Swap'); };
  let lockedOnce = false, unlockAt = 0;
  const lock = () => { try { const r = canvas.requestPointerLock?.(); if (r?.catch) r.catch(() => {}); } catch { /* not allowed here */ } };
  const onLockChange = () => {
    if (document.pointerLockElement === canvas) { lockedOnce = true; return; }
    unlockAt = performance.now(); input.fire = false;
    if (mode === 'playing' && lockedOnce) pause();
  };
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove); canvas.addEventListener('mousedown', onMouseDown); window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: true });
  document.addEventListener('pointerlockchange', onLockChange);

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
      on(b, 'pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); if (what === 'fire') { input.fire = true; lookStart(e); } else if (what === 'act') input.act = true; else input.edges.add(what); });
      on(b, 'pointermove', (e) => { if (what === 'fire') lookMove(e); });
      const up = (e) => { b.classList.remove('on'); if (what === 'fire') { input.fire = false; lookEnd(e); } if (what === 'act') input.act = false; };
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
    const down = P.shield <= 0.5, charging = P.shield < L.SHIELD.max && P.shield > 0.5;
    set('bars', '.down', down); set('bars', '.charging', charging && shieldFlash < 0.2); set('bars', '.flash', shieldFlash > 0.5);
    set('bars', '.low', P.health < 35);
    set('mag', 'text', String(s.mag)); set('reserve', 'text', String(s.reserve)); set('wname', 'text', w.name);
    set('ammo', '.reloading', L.reloading(P, t)); set('ammo', '.empty', s.mag === 0 && s.reserve === 0);
    const g = Math.max(0, P.grenades - nadesSpent);
    set('nades', 'text', '✶'.repeat(g) + '·'.repeat(Math.max(0, L.GRENADES.max - g)));
    set('score', 'text', (me?.pts ?? 0).toLocaleString()); set('wave', 'text', String(Math.max(1, snap?.wv || 1)));
    set('left', 'text', snap?.ph === 'wave' ? `${snap.left} EN CAMINO` : snap?.ph === 'break' ? `SIGUIENTE EN ${snap.cd}` : '');
    set('count', 'text', `${snap ? snap.pl.filter((r) => !(r[7] & 8)).length : 0} EN LA CANCHA`);
    set('banner', 'text', t < banner.until ? banner.text : ''); set('banner', '.on', t < banner.until);
    const st = me?.st || 'alive';
    set('vig', '.hurt', hurtFlash > 0.15); set('vig', '.shield', shieldFlash > 0.15 && hurtFlash <= 0.15); set('vig', '.down', (down && st === 'alive') || st === 'downed');
    set('dir', 'op', dirHit ? dirHit.life.toFixed(2) : '0'); if (dirHit) set('dir', 'rot', (yaw - dirHit.a + Math.PI).toFixed(2));
    set('reticle', '.on', aimingAt()); set('reticle', '.pistol', P.current === 'pistol'); set('reticle', '.hit', hitMark > 0);
    const pr = me?.pr;
    const ptxt = !pr ? '' : pr.k === 'revive' ? `${PAD ? 'MANTÉN ACCIÓN' : 'MANTÉN E'} · LEVANTA A ${pr.label}` : pr.k === 'build' ? `${PAD ? 'MANTÉN ACCIÓN' : 'MANTÉN E'} · CLAVA TABLAS ${pr.label}` : `${PAD ? 'ACCIÓN' : 'E'} · ${pr.label} ${pr.cost} PTS`;
    set('prompt', 'text', ptxt); set('prompt', '.on', !!pr && st === 'alive'); set('promptbar', 'w', pr && pr.p ? Math.min(1, pr.p).toFixed(2) : '0');
    set('actbtn', '.ready', !!pr && st === 'alive');
    set('down', '.on', st !== 'alive' && joined);
    set('down', 'text', st === 'downed' ? `¡CAÍSTE! QUE TE LEVANTEN · ${me.cd}` : st === 'dead' ? (snap?.ph === 'over' ? '' : `DE VUELTA EN ${me.cd}`) : '');
  }
  function aimingAt() {
    const o = eye(), d = fwd(), now = performance.now();
    for (const e of ents.en.values()) if (L.raySphere(o, d, enemyCenter(e, now), L.ENEMIES[e.type].radius * 1.4) < 60) return true;
    for (const p of ents.pl.values()) { if (p.flags & 14) continue; const c = cur(p, now); if (L.raySphere(o, d, { x: c.x, y: c.y + 1, z: c.z }, 0.52) < 60) return true; }
    return false;
  }

  // ---- the loop
  function update(dt) {
    const alive = me?.st === 'alive';
    const sens = PAD ? 0.0042 : 0.0023;
    yaw -= input.look[0] * sens; pitch -= input.look[1] * sens; input.look[0] = input.look[1] = 0;
    if (input.keys.has('ArrowLeft')) yaw += 2.4 * dt; if (input.keys.has('ArrowRight')) yaw -= 2.4 * dt;
    pitch = Math.max(-1.45, Math.min(1.45, pitch));
    let mx = input.stick[0], mz = -input.stick[1];
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) mz += 1; if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) mz -= 1;
    if (input.keys.has('KeyD')) mx += 1; if (input.keys.has('KeyA')) mx -= 1;
    if (autopilot) { // test hook: walk to a spot
      const dx = autopilot.x - pos.x, dz = autopilot.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.4) autopilot = null; else { const lx = dx / d, lz = dz / d; mz = -(lx * Math.sin(yaw) + lz * Math.cos(yaw)); mx = lx * Math.cos(yaw) - lz * Math.sin(yaw); }
    }
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    if (alive) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      pos.x += (fx * mz + rx * mx) * SPEED * dt; pos.z += (fz * mz + rz * mx) * SPEED * dt;
      collide(pos, RADIUS, pos.y, 1.8, bars);
      const now = performance.now();
      for (const e of ents.en.values()) { const c = cur(e, now), dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = RADIUS + L.ENEMIES[e.type].radius * 0.9; if (d < m && d > 1e-4 && Math.abs(c.y - pos.y) < 1.5) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; } }
      if ((input.edges.has('Space') || input.edges.has('jump')) && onGround) { vy = JUMP; onGround = false; }
    }
    vy -= GRAV * dt; pos.y += vy * dt;
    const gy = groundAt(pos.x, pos.z, pos.y, bars);
    if (pos.y <= gy) { pos.y = gy; vy = 0; onGround = true; } else if (pos.y - gy > 0.05) onGround = false;
    if (alive && onGround && ml > 0.1 && !reduceMotion) bob += dt * 9; else bob *= 0.9;
    // weapons
    L.tickReload(P, t);
    if (alive) {
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
    }
    if (!input.fire) input.fireHeld = false;
    input.edges.clear();
    if (P.shield <= 0.5 && alive && t > alarmT) { sfx('alarm'); alarmT = t + 0.6; }
    hurtFlash = Math.max(0, hurtFlash - dt * 2.5); shieldFlash = Math.max(0, shieldFlash - dt * 3); hitMark = Math.max(0, hitMark - dt);
    if (dirHit) { dirHit.life -= dt; if (dirHit.life <= 0) dirHit = null; }
  }
  function sendInput(now) {
    if (!joined || now - sendT < SEND_MS) return;
    sendT = now;
    const act = input.act || input.keys.has('KeyE');
    const msg = { p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)], yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), w: P.current, act, ev: pending };
    if (sender.send(msg)) pending = [];
    else if (pending.length > 40) pending = pending.slice(-40);
  }

  function animate(dt, now) {
    for (const e of ents.en.values()) {
      const c = cur(e, now), m = e.m;
      const moved = Math.hypot(e.to.x - e.from.x, e.to.z - e.from.z) / (e.dur / 1000);
      m.root.position.set(c.x, c.y, c.z); m.root.rotation.y = c.yaw;
      e.phase += dt * Math.min(9, moved * 2.2 + 0.3);
      const sw = Math.sin(e.phase) * Math.min(0.8, moved * 0.25);
      m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
      const st = e.st, tt = now / 1000;
      m.root.rotation.x = st === 'tackle' ? -0.45 : 0;
      if (st === 'hit' || st === 'tear') { const a = Math.sin(tt * 14 + e.seed); m.arms[0].rotation.x = -1.3 + a * 0.6; m.arms[1].rotation.x = -1.3 - a * 0.6; }
      else if (st === 'shoot') { m.arms[1].rotation.x = -1.5; m.arms[0].rotation.x = -0.9; }
      else if (st === 'bless') { m.arms[0].rotation.x = -2.7; m.arms[1].rotation.x = -2.7; }
      else if (st === 'tackle') { m.arms[0].rotation.x = -1.6; m.arms[1].rotation.x = -1.6; }
      else if (e.type === 'mariachi' && moved < 0.5) { m.arms[1].rotation.x = -1.2 + Math.sin(tt * 3 + e.seed) * 0.15; m.arms[0].rotation.x = -0.4; }
      else { m.arms[0].rotation.x = -sw * 0.8; m.arms[1].rotation.x = e.type === 'granjero' ? -0.5 : sw * 0.8; }
      if (e.type === 'padre') m.arms[0].rotation.z = Math.sin(tt * 2 + e.seed) * 0.3; // the censer swings
      if (e.haste && R() < dt * 6) emit(c.x, c.y + 1.2, c.z, 1, GOLD, { speed: 0.5, up: 1, life: 0.6, g: -1 });
      if (e.flash > 0) { e.flash = Math.max(0, e.flash - dt * 6); for (const mt of m.mats) mt.emissive.setScalar(e.flash * 0.6); }
    }
    for (let i = dying.length - 1; i >= 0; i--) { const d = dying[i]; d.life -= dt; d.m.root.scale.multiplyScalar(0.88); d.m.root.rotation.y += dt * 12; d.m.root.position.y += dt * 2; if (d.life <= 0) { scene.remove(d.m.root); disposeTree(d.m.root); dying.splice(i, 1); } }
    for (const p of ents.pl.values()) {
      const c = cur(p, now), m = p.m, f = p.flags || 0;
      m.root.visible = !(f & 4);
      m.root.position.set(c.x, c.y, c.z); m.root.rotation.y = c.yaw;
      const downed = !!(f & 2);
      m.body.rotation.x = downed ? -1.35 : 0; m.body.position.y = downed ? 0.3 : 0; m.tag.position.y = downed ? 1.2 : 2.95;
      if (f & 1 && !downed) p.phase += dt * 9; const sw = f & 1 && !downed ? Math.sin(p.phase) * 0.6 : 0;
      m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
      m.arms[1].rotation.x = f & 16 ? -1.5 - (p.pitch || 0) : -0.9; m.arms[0].rotation.x = f & 16 ? -1.2 : -sw * 0.6;
    }
    for (const map of [ents.pj, ents.gr]) for (const o of map.values()) { const c = cur(o, now); o.m.position.set(c.x, c.y, c.z); o.m.rotation.y += dt * 8; o.m.rotation.x += dt * 5; }
    let i = 0; for (const k of ents.pk.values()) { k.m.rotation.y += dt * 1.6; k.m.position.y = k.y + 0.15 + Math.sin(now / 330 + i++) * 0.08; }
    for (const s of world.stations) s.children[0].rotation.y = Math.sin(now / 900) * 0.06;
  }

  function effects(dt) {
    for (let i = 0; i < PN; i++) {
      const p = parts[i]; if (p.life <= 0) continue;
      p.life -= dt; if (p.life <= 0) { pPos[i * 3 + 1] = -999; continue; }
      const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.g * dt;
      pPos[i * 3] += p.vx * dt; pPos[i * 3 + 1] += p.vy * dt; pPos[i * 3 + 2] += p.vz * dt;
      const x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, pPos[i * 3])), z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, pPos[i * 3 + 2]));
      const gy = terrain(x, z); if (pPos[i * 3 + 1] < gy + 0.03) { pPos[i * 3 + 1] = gy + 0.03; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    for (const tr of tracers) if (tr.visible) { tr.life -= dt; if (tr.life <= 0) tr.visible = false; }
    for (let i = blasts.length - 1; i >= 0; i--) { const b = blasts[i]; b.life -= dt; b.m.scale.setScalar(1 + (0.3 - b.life) * 14); b.m.material.opacity = Math.max(0, b.life / 0.3) * 0.8; if (b.life <= 0) { scene.remove(b.m); b.m.material.dispose(); blasts.splice(i, 1); } }
    world.water.material.emissive.setRGB(0.04, 0.2 + Math.sin(performance.now() / 400) * 0.04, 0.25);
  }

  function placeCamera(dt) {
    vmRig.visible = false;
    if (overview) { camera.position.set(34, 58, 66); camera.lookAt(-2, 0, 6); return; }
    if (mode === 'title' || mode === 'loading' || !joined) {
      const a = performance.now() / 14000;
      camera.position.set(Math.sin(a) * 26, 22, Math.cos(a) * 46); camera.lookAt(0, 1, Math.cos(a) * 12); return;
    }
    const st = me?.st || 'alive';
    const sh = reduceMotion ? 0 : shake; shake = Math.max(0, shake - dt * 2);
    const by = Math.sin(bob) * 0.04, bx = Math.cos(bob * 0.5) * 0.03;
    const lift = st === 'downed' ? -1.05 : st === 'dead' ? 2.5 : 0;
    camera.position.set(pos.x + (R() - 0.5) * sh * 0.2, pos.y + EYE + by + lift + (R() - 0.5) * sh * 0.2, pos.z);
    camera.rotation.set(st === 'dead' ? Math.min(pitch, -0.5) : pitch, yaw, st === 'downed' ? 0.3 : 0);
    if (st !== 'alive') return;
    vmRig.visible = true;
    const c = P.current, home = VM_HOME[c];
    vm.rifle.visible = c === 'rifle'; vm.pistol.visible = c === 'pistol';
    vmKick = Math.max(0, vmKick - dt * 14); swapAnim = Math.max(0, swapAnim - dt * 4);
    const rl = L.reloading(P, t) ? Math.sin(Math.min(1, (P.weapons[c].reloadUntil - t) / L.WEAPONS[c].reload) * Math.PI) : 0;
    let sw = 0; if (swing >= 0) { swing += dt; sw = Math.sin(Math.min(1, swing / 0.3) * Math.PI); if (swing > 0.3) swing = -1; }
    const building = me?.pr?.k === 'build' && (input.act || input.keys.has('KeyE')) ? Math.abs(Math.sin(performance.now() / 90)) : 0; // hammering
    const g = vm[c]; g.position.set(home.x + bx * 0.5 - sw * 0.12, home.y + by * 0.5 - rl * 0.18 - swapAnim * 0.3 - building * 0.1, home.z + vmKick * 0.05 - sw * 0.25);
    g.rotation.set(rl * 0.5 + vmKick * 0.06 - sw * 0.4 + building * 0.5, 0.06 + sw * 0.6, rl * 0.3);
    vm.flash.visible = vmKick > 0.6; if (vm.flash.visible) { g.updateMatrix(); vm.flash.position.copy(vm.muzzle[c]).applyMatrix4(g.matrix); vm.flash.rotation.set(0, g.rotation.y, R() * 3); }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    t += dt;
    fpsT += dt; fpsN++; if (fpsT >= 1) { fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
    if (joined && (mode === 'playing' || mode === 'paused')) { if (mode === 'playing') update(dt); else { vy -= GRAV * dt; pos.y += vy * dt; const gy = groundAt(pos.x, pos.z, pos.y, bars); if (pos.y <= gy) { pos.y = gy; vy = 0; } } sendInput(now); }
    animate(dt, now);
    effects(dt);
    placeCamera(dt);
    resize();
    renderer.clear(); renderer.render(scene, camera);
    if (vmRig.visible && (mode === 'playing' || mode === 'paused')) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
    if (joined && (mode === 'playing' || mode === 'paused')) hud();
    frames++;
  }
  let W = 0, Hh = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h || (w === W && h === Hh)) return; W = w; Hh = h;
    renderer.setSize(w, h, false);
    const a = w / h, deg = Math.PI / 180, base = touch ? 74 : 70;
    camera.aspect = a; camera.fov = a >= 1 ? base : Math.min(98, 2 * Math.atan(Math.tan(36 * deg) / a) / deg); camera.updateProjectionMatrix();
    vmCam.aspect = a; vmCam.fov = a >= 1 ? 55 : 2 * Math.atan(Math.tan(31 * deg) / a) / deg; vmCam.updateProjectionMatrix();
  }
  function pause() { if (mode !== 'playing') return; input.fire = false; input.act = false; input.keys.clear(); setMode('paused'); }
  function disposeTree(o) { o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material?.map) c.material.map.dispose(); }); }

  const net = connect({ onSnap, onStatus: (s) => { status = s; info(); if (s === 'replaced') { joined = false; setMode('title', { note: 'Opened in another tab.' }); } } });
  onMode('loading', {});
  raf = requestAnimationFrame(frame);

  const api = {
    async start() {
      if (joining || mode === 'playing') return;
      if (audio) { audio.resume(); audio.music(true); }
      if (!PAD) lock();
      if (joined) { setMode('playing'); return; }
      joining = true;
      const r = await join().catch(() => ({ ok: false, data: { error: 'No connection to the canyon.' } }));
      joining = false;
      if (!r.ok) { if (document.pointerLockElement) document.exitPointerLock?.(); if (audio) audio.music(false); setMode('title', { note: r.data?.error || 'Could not get in.' }); return; }
      const m = r.data.me; myId = m.id; me = m; joined = true; lastAg = m.ag; P = L.createPlayer(); prevSt = m.st;
      if (m.corr) { pos = { x: m.corr[0], y: m.corr[1], z: m.corr[2] }; if (m.corr.length > 3) yaw = m.corr[3]; }
      pitch = 0; vy = 0; banner = { text: snap?.ph === 'wave' ? `OLEADA ${snap.wv}` : '¡A DARLE!', until: t + 2 };
      setMode('playing'); info();
    },
    resume() { if (mode !== 'paused') return; setMode('playing'); if (audio) { audio.resume(); audio.music(true); } if (!PAD) lock(); },
    pause,
    get mode() { return mode; },
    justUnlocked: () => performance.now() - unlockAt < 400,
    locked: () => document.pointerLockElement === canvas,
    setMuted(m) { muted = m; if (audio) { audio.setMuted(m); if (!m && mode === 'playing') audio.music(true); } },
    board() {
      if (!snap) return [];
      return snap.pl.map((r) => ({ id: r[0], name: r[1], kills: r[10], pvp: r[11], deaths: r[12], score: r[13], color: PLAYER_COLORS[r[14] % PLAYER_COLORS.length], me: r[0] === myId, away: !!(r[7] & 8), downed: !!(r[7] & 2), dead: !!(r[7] & 4) }))
        .sort((a, b) => b.score - a.score);
    },
    // read-outs + hooks for the browser checks
    state: () => ({ mode, joined, myId, st: me?.st, wave: snap?.wv || 0, phase: snap?.ph, left: snap?.left, pts: me?.pts, shield: Math.round(P.shield), health: Math.round(P.health), grenades: P.grenades,
      weapon: P.current, mag: P.weapons[P.current].mag, reserve: P.weapons[P.current].reserve, pos: { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2) }, yaw: +yaw.toFixed(3),
      enemies: ents.en.size, others: [...ents.pl.values()].map((p) => p.name), othersAt: [...ents.pl.values()].map((p) => ({ name: p.name, ...cur(p, performance.now()), flags: p.flags })), bars: bars.slice(), prompt: me?.pr || null, fps: Math.round(fps), frames, status, audio: audio ? audio.ctx.state : 'none' }),
    aimAt(x, y, z) { const o = eye(); yaw = Math.atan2(-(x - o.x), -(z - o.z)); pitch = Math.atan2(y - o.y, Math.hypot(x - o.x, z - o.z)); },
    aimAtNearest() { const now = performance.now(); const e = [...ents.en.values()].sort((a, b) => Math.hypot(a.to.x - pos.x, a.to.z - pos.z) - Math.hypot(b.to.x - pos.x, b.to.z - pos.z))[0]; if (!e) return false; const c = enemyCenter(e, now); api.aimAt(c.x, c.y, c.z); return true; },
    aimAtPlayer(name) { const p = [...ents.pl.values()].find((q) => q.name === name); if (!p) return false; const c = cur(p, performance.now()); api.aimAt(c.x, c.y + 1, c.z); return true; },
    face(yw, pt = 0) { yaw = yw; pitch = pt; },
    walkTo(x, z) { autopilot = { x, z }; },
    overview(onOff) { overview = !!onOff; },
    dispose() {
      cancelAnimationFrame(raf);
      if (joined) leave().catch(() => {});
      net.close();
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown); window.removeEventListener('mouseup', onMouseUp); canvas.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onLockChange);
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

function angLerp(a, b, k) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; }
