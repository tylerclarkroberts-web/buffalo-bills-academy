// EL HALO engine (horde): one three.js scene (the canyon), a second tiny scene for the first-person gun, a third for
// the lobby's rotating character preview, and DOM HUD updates by ref (no React re-render per frame). The match runs on
// the server (server/elhalo/match.js): this file predicts your own movement, gun and (when you drive) the jeep, draws
// everyone else smoothly between the server's ~10 updates a second, and turns the server's events into confetti,
// sounds and HUD. Free play: nothing here touches money.
import * as THREE from 'three';
import { buildWorld, terrain, PICADO } from './world.js';
import { ENEMY_MAKERS, makeViewModels, makePinata, makePickup, makePlayerModel, makeNote, makeTruck, makeJeep, makeSticky, makeRocket, makeNeedle,
  makeBleedRing, setBleed, makeWeaponDisplay, PLAYER_COLORS } from './models.js';
import * as L from './logic.js';
import { BOUNDS, OPENINGS, BOARDS_MAX, groundAt, collide, wallDist } from '../../../../server/elhalo/map.js';
import { createAudio } from './audio.js';
import { connect, join, leave, inputSender, post } from './net.js';

const EYE = 1.62, RADIUS = 0.38, GRAV = 16, JUMP = 6.2, SPEED = 5.4;
const TYPES = L.ENEMY_TYPES, WIDS = L.WEAPON_IDS;
const NAME = { luchador: 'LUCHADOR', mariachi: 'MARIACHI', granjero: 'GRANJERO', padre: 'PADRE', chupacabra: 'CHUPACABRAS', llorona: 'LA LLORONA', cucuy: 'EL CUCUY', nahual: 'NAHUAL', lechuza: 'LECHUZA' };
const ST = ['walk', 'hit', 'tear', 'tackle', 'shoot', 'bless', 'idle', 'climb', 'swoop', 'wail'];
const MARIGOLD = [[1, 0.6, 0.05], [1, 0.75, 0.1], [0.95, 0.45, 0.05]];
const GOLD = [[1, 0.9, 0.4], [1, 1, 0.8], [1, 0.8, 0.2]];
const WOOD = [[0.62, 0.42, 0.24], [0.5, 0.33, 0.18], [0.75, 0.55, 0.35]];
const SMOKE = [[0.25, 0.22, 0.25], [0.4, 0.36, 0.38], [0.15, 0.13, 0.16]];
const WISP = [[0.85, 0.92, 1], [0.6, 0.75, 1], [1, 1, 1]];
const BLUE = [[0.25, 0.85, 1], [0.6, 0.95, 1], [1, 1, 1]];
const PINK = [[1, 0.3, 0.75], [1, 0.6, 0.9], [0.8, 0.2, 1]];
const DUST = [[0.75, 0.6, 0.42], [0.6, 0.48, 0.34], [0.86, 0.74, 0.55]];
const DEATH = { chupacabra: [[0.42, 0.48, 0.4], [0.45, 0.08, 0.1], [0.2, 0.22, 0.2]], llorona: WISP, cucuy: SMOKE, nahual: [[0.45, 0.42, 0.38], [0.9, 0.86, 0.75], [1, 0.55, 0.1]], lechuza: [[0.42, 0.3, 0.2], [0.9, 0.84, 0.72], [1, 1, 1]] };
const TRACER = { chispas: 0x7dff5a, francotirador: 0xffffff, torreta: 0xffc04a, rafaga: 0xfff0b0, laser: 0xff3040 };
const KICK = { pistol: 0.012, rifle: 0.005, chispas: 0.008, agujas: 0.003, rafaga: 0.007, escopeta: 0.05, escopetita: 0.035, francotirador: 0.06, laser: 0.08, cohetes: 0.07, torreta: 0.004 };
const SEND_MS = 100;
const JEEP = { accel: 14, brake: 22, top: 17, rev: 7, steer: 1.9, drag: 1.6 };
const lookArr = (s) => (typeof s === 'string' ? s.split('').map((c) => c.charCodeAt(0) - 48) : Array.isArray(s) ? s : L.DEFAULT_LOOK.slice());

export function createGame({ canvas, root, touch = false, reduceMotion = false, muted = false, musicLevel = 0, onMode = () => {}, onInfo = () => {} }) {
  const R = (() => { let s = (Date.now() & 0xffff) + 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 1.5));
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(touch ? 74 : 70, 1, 0.05, 460); camera.rotation.order = 'YXZ'; scene.add(camera);
  const world = buildWorld(scene, { lowEnd: touch });

  // first-person guns in their own scene so they never clip into walls
  const vmScene = new THREE.Scene(), vmCam = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
  vmScene.add(new THREE.HemisphereLight(0xffd8b0, 0x5a3020, 2.2)); const vl = new THREE.DirectionalLight(0xffb070, 1.6); vl.position.set(-1, 1, 0.5); vmScene.add(vl);
  const vm = makeViewModels(); const vmRig = new THREE.Group(); vmScene.add(vmRig);
  for (const g of Object.values(vm.guns)) vmRig.add(g);
  vmRig.add(vm.flash);

  // the lobby preview: your hero on a little turntable, drawn into the box the panel leaves for it
  const pvScene = new THREE.Scene(), pvCam = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
  pvScene.add(new THREE.HemisphereLight(0xffe0c0, 0x4a2a3a, 2.4)); const pl1 = new THREE.DirectionalLight(0xffc080, 2); pl1.position.set(2, 3, 3); pvScene.add(pl1);
  const pvRim = new THREE.DirectionalLight(0x40e0ff, 1.2); pvRim.position.set(-3, 2, -2); pvScene.add(pvRim);
  const pvSpin = new THREE.Group(); pvScene.add(pvSpin);
  { const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.14, 10), new THREE.MeshLambertMaterial({ color: 0x7a3a2a, flatShading: true })); disk.position.y = -0.07; pvSpin.add(disk);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.035, 4, 20), new THREE.MeshBasicMaterial({ color: 0xffc23a })); rim.rotation.x = Math.PI / 2; pvSpin.add(rim); }
  pvCam.position.set(0, 1.55, 6.2); pvCam.lookAt(0, 1.3, 0);
  let pvModel = null, pvLook = null, pvColor = 0;
  function setPreview(look, color = pvColor) {
    const key = `${lookArr(look).join('')}:${color}`; if (pvModel && key === pvLook) return; pvLook = key; pvColor = color;
    if (pvModel) { pvSpin.remove(pvModel.root); disposeTree(pvModel.root); }
    pvModel = makePlayerModel(color, null, lookArr(look)); pvModel.arms[1].rotation.x = -0.4; pvSpin.add(pvModel.root);
  }

  // pooled effects: one Points cloud for confetti/dust/petals/sparks, tracers, beams, blast flashes
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
  const tracers = Array.from({ length: 24 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false })); m.visible = false; m.life = 0; scene.add(m); return m; });
  let trNext = 0;
  const beams = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1), new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.9, depthWrite: false, fog: false })); m.visible = false; m.life = 0; scene.add(m); return m; });
  let bmNext = 0;
  const flashGeo = new THREE.IcosahedronGeometry(1, 1), ringGeo = new THREE.RingGeometry(0.8, 1, 24);
  const blasts = [];

  const audio = (() => { try { return createAudio(); } catch { return null; } })();
  if (audio) { audio.setMuted(muted); audio.setMusicLevel(musicLevel); }
  const sfx = (name, ...a) => { if (audio && !muted) try { audio[name](...a); } catch { /* sound is optional */ } };
  const near = (x, z, r = 28) => Math.hypot(x - pos.x, z - pos.z) < r;

  // ---- local state
  let mode = 'loading', t = 0, raf = 0, last = performance.now(), frames = 0, fps = 60, fpsT = 0, fpsN = 0;
  let P = L.createPlayer(), pos = { x: 0, y: 2, z: 0 }, vy = 0, onGround = true, yaw = 0, pitch = 0;
  let banner = { text: '', until: 0 }, shake = 0, vmKick = 0, swing = -1, swapAnim = 0, hurtFlash = 0, shieldFlash = 0, alarmT = 0, dirHit = null, bob = 0, emptyT = 0, hitMark = 0, headMark = 0;
  let overview = false, autopilot = null, zoom = false, charging = null, burstQ = 0, burstT = 0, lunge = null, nadeKind = 'frag', wvSeen = -1, nightK = 0, engineT = 0, actTap = false;
  let veh = null; // the jeep, while you drive it: { x, y, z, yaw, spd }
  const spent = { frag: 0, sticky: 0 };
  const input = { keys: new Set(), fire: false, fireHeld: false, act: false, look: [0, 0], stick: [0, 0], edges: new Set() };

  // ---- the shared world as the server last told us
  let snap = null, me = null, myId = null, joined = false, joining = false, lastAg = null, lastSnapAt = 0, prevSt = null;
  let pending = [], sendT = 0, status = 'connecting', infoKey = '';
  const bars = OPENINGS.map((o) => (o.open ? 0 : BOARDS_MAX));
  const ents = { en: new Map(), pl: new Map(), pj: new Map(), gr: new Map(), pk: new Map(), pr: new Map() };
  const dying = [];
  const sender = inputSender();
  const truck = makeTruck(); truck.root.visible = false; scene.add(truck.root);
  let truckObj = null, truckGun = null, truckGunIdx = -1;
  const jeep = makeJeep(); jeep.root.visible = false; scene.add(jeep.root);
  let jeepObj = null;
  const lerpTo = (o, x, y, z, yw, now, dur) => {
    if (o.to) { const k = Math.min(1, (now - o.t0) / o.dur); o.from = { x: o.from.x + (o.to.x - o.from.x) * k, y: o.from.y + (o.to.y - o.from.y) * k, z: o.from.z + (o.to.z - o.from.z) * k, yaw: angLerp(o.from.yaw, o.to.yaw, k) }; }
    else o.from = { x, y, z, yaw: yw };
    o.to = { x, y, z, yaw: yw }; o.t0 = now; o.dur = dur;
  };
  const cur = (o, now) => { const k = Math.min(1, (now - o.t0) / o.dur); return { x: o.from.x + (o.to.x - o.from.x) * k, y: o.from.y + (o.to.y - o.from.y) * k, z: o.from.z + (o.to.z - o.from.z) * k, yaw: angLerp(o.from.yaw, o.to.yaw, k) }; };
  const seatAt = (j, seat) => { const fx = -Math.sin(j.yaw), fz = -Math.cos(j.yaw), rx = Math.cos(j.yaw), rz = -Math.sin(j.yaw); return seat === 'd' ? { x: j.x + fx * 0.25 - rx * 0.45, y: j.y - 0.25, z: j.z + fz * 0.25 - rz * 0.45 } : { x: j.x - fx * 1.15, y: j.y + 0.85, z: j.z - fz * 1.15 }; };
  const jeepNow = (now) => (veh ? veh : jeepObj ? cur(jeepObj, now) : null);

  function onSnap(msg) {
    const s = msg.s, now = performance.now();
    const dur = Math.max(60, Math.min(250, lastSnapAt ? now - lastSnapAt : 100)); lastSnapAt = now;
    me = msg.me; myId = me.id; snap = s;
    // enemies
    const seen = new Set();
    for (const r of s.en) {
      const [id, ti, x, y, z, yw, hp, st, flash, haste, extra = 0] = r; seen.add(id);
      let e = ents.en.get(id);
      const type = TYPES[ti], lift = L.ENEMIES[type]?.float || 0;
      if (!e) {
        const m = ENEMY_MAKERS[type](R); m.root.position.set(x, y + lift, z); m.root.rotation.y = yw; scene.add(m.root);
        e = { id, type, m, phase: R() * 6, seed: R() * 10, jt: 0 }; ents.en.set(id, e);
        if (mode !== 'loading') emit(x, y + 0.8, z, 20, L.FOLKLORE.includes(type) || type === 'chupacabra' ? SMOKE : MARIGOLD, { speed: 3, up: 3, life: 1.2, g: 4 });
      }
      lerpTo(e, x, y + lift, z, yw, now, dur); e.hp = hp; e.st = ST[st] || 'walk'; if (flash) e.flash = 1; e.haste = haste; e.extra = extra;
    }
    for (const [id, e] of ents.en) if (!seen.has(id)) { ents.en.delete(id); const c = cur(e, now); dying.push({ m: e.m, life: 0.45, x: c.x, y: c.y, z: c.z }); }
    // players (yourself is the camera, not a model)
    const seenP = new Set();
    for (const r of s.pl) {
      const [id, name, x, y, z, yw, pt, flags, , , , , , , color, bleed, , seat, , look] = r;
      if (id === myId || (flags & 8)) continue; seenP.add(id);
      let p = ents.pl.get(id);
      if (p && p.look !== look) { scene.remove(p.m.root); disposeTree(p.m.root); ents.pl.delete(id); p = null; }
      if (!p) { const m = makePlayerModel(color, name, lookArr(look)); m.root.position.set(x, y, z); scene.add(m.root); p = { id, name, m, phase: 0, look }; ents.pl.set(id, p); }
      lerpTo(p, x, y, z, yw, now, dur); p.flags = flags; p.pitch = pt; p.bleed = bleed; p.seat = seat;
    }
    for (const [id, p] of ents.pl) if (!seenP.has(id)) { scene.remove(p.m.root); disposeTree(p.m.root); if (p.ring) { scene.remove(p.ring); disposeTree(p.ring); } ents.pl.delete(id); }
    // notes, grenades, rockets and needles, pickups
    syncSimple(ents.pj, s.pj, () => makeNote(), now, dur);
    syncSimple(ents.gr, (s.gr || []).map((g) => [g[0], g[1], g[2], g[3], g[4]]), (kind) => (kind === 1 ? makeSticky() : makePinata(PICADO[Math.floor(R() * PICADO.length)])), now, dur);
    syncSimple(ents.pr, (s.pr || []).map((q) => [q[0], q[2], q[3], q[4], q[1]]), (kind) => (kind === 0 ? makeRocket() : makeNeedle()), now, dur);
    const seenK = new Set();
    for (const [id, kind, x, y, z] of s.pk) { seenK.add(id); if (!ents.pk.has(id)) { const m = makePickup(kind); m.position.set(x, y + 0.1, z); scene.add(m); ents.pk.set(id, { m, y }); } }
    for (const [id, k] of ents.pk) if (!seenK.has(id)) { scene.remove(k.m); disposeTree(k.m); ents.pk.delete(id); }
    // boards (la misión has none)
    s.bd.forEach((n, i) => {
      const o = OPENINGS[i]; if (o.open) { bars[i] = 0; return; }
      if (n < bars[i]) for (let k = n; k < bars[i]; k++) emit(o.x, o.y0 + 0.4 + k * 0.3, o.z, 8, WOOD, { speed: 3, up: 2, life: 0.9 });
      bars[i] = n; const b = world.boards[i];
      if (b.shown !== n) { b.planks.forEach((pl, k) => { pl.visible = k < n; }); b.shown = n; }
    });
    // the supply truck
    if (s.tk) {
      const [x, z, yw, wi] = s.tk;
      if (!truckObj) { truckObj = {}; truck.root.visible = true; }
      lerpTo(truckObj, x, terrain(x, z), z, yw, now, dur);
      if (wi !== truckGunIdx) { if (truckGun) truck.show.remove(truckGun); truckGun = makeWeaponDisplay(WIDS[wi]); truck.show.add(truckGun); truckGunIdx = wi; }
      truckObj.stopped = !!s.tk[4];
    } else if (truckObj) { truckObj = null; truck.root.visible = false; }
    // the jeep
    if (s.jp) {
      const [x, y, z, yw, driver, gunner, ty, tp] = s.jp;
      if (!jeepObj) { jeepObj = {}; jeep.root.visible = true; }
      lerpTo(jeepObj, x, y, z, yw, now, dur); jeepObj.driver = driver; jeepObj.gunner = gunner; jeepObj.ty = ty; jeepObj.tp = tp;
    } else if (jeepObj) { jeepObj = null; jeep.root.visible = false; }
    // you
    if (me.in) {
      P.shield = me.sh; P.health = me.hp;
      if (me.nd) { spent.frag = 0; spent.sticky = 0; }
      syncWeapons();
      if (lastAg === null) lastAg = me.ag;
      if (me.ag > lastAg) { for (let k = lastAg; k < me.ag; k++) for (const id of Object.keys(P.weapons)) L.addAmmo(P, id, L.ammoPack(id)); lastAg = me.ag; }
      if (me.corr) { pos.x = me.corr[0]; pos.y = me.corr[1]; pos.z = me.corr[2]; vy = 0; lunge = null; if (me.corr.length > 3) { yaw = me.corr[3]; pitch = 0; } }
      // the jeep: get in, drive, get out
      if (me.seat === 'd' && !veh && jeepObj) { const j = cur(jeepObj, now); veh = { x: j.x, y: j.y, z: j.z, yaw: j.yaw, spd: 0 }; yaw = j.yaw; pitch = -0.12; }
      if (me.seat !== 'd') veh = null;
      if (me.vc && veh) { veh.x = me.vc[0]; veh.y = me.vc[1]; veh.z = me.vc[2]; veh.yaw = me.vc[3]; veh.spd = 0; }
      if (prevSt && prevSt !== me.st) {
        if (me.st === 'downed') { sfx('shieldDown'); banner = { text: '¡CAÍSTE!', until: t + 2 }; zoom = false; }
        if (me.st === 'dead') banner = { text: 'TE DESANGRASTE', until: t + 2.5 };
        if (me.st === 'alive' && prevSt !== 'alive') { banner = { text: prevSt === 'downed' ? '¡DE PIE!' : '¡OTRA VEZ!', until: t + 1.6 }; sfx('pickup'); }
      }
      prevSt = me.st;
      if (!joined && !joining) joined = true;
      // the lobby hands over to the match (and the match, when it ends, back to the lobby)
      if (mode === 'lobby' && s.ph !== 'lobby') enterPlay();
      else if ((mode === 'playing' || mode === 'paused') && s.ph === 'lobby') { input.fire = false; input.keys.clear(); zoom = false; if (document.pointerLockElement === canvas) document.exitPointerLock?.(); setMode('lobby'); }
    } else if (joined && !joining) { joined = false; prevSt = null; veh = null; if (mode !== 'title') setMode('title'); }
    for (const e of s.ev) event(e);
    nightTarget = s.nt ? 1 : 0;
    if (mode === 'loading') setMode('title');
    info();
  }
  let nightTarget = 0;
  // your guns: the server says which two you carry (ws), which is in hand (cw) and bumps wv whenever that changes
  function syncWeapons() {
    const ws = me.ws || L.START_WEAPONS;
    if (me.wv !== wvSeen || ws.some((id) => !P.weapons[id])) {
      const fresh = prevSt === 'dead' || wvSeen < 0;
      const old = P.weapons; P.weapons = {};
      for (const id of ws) P.weapons[id] = !fresh && old[id] ? old[id] : L.loadout(id);
      if (old.torreta) P.weapons.torreta = old.torreta;
      wvSeen = me.wv;
      if (P.weapons[me.cw]) P.current = me.cw; else P.current = ws[0];
      P.other = ws.find((id) => id !== P.current) || ws[0];
      charging = null; burstQ = 0;
    }
    if (me.seat === 'g') { if (!P.weapons.torreta) P.weapons.torreta = L.loadout('torreta'); if (P.current !== 'torreta') { P.current = 'torreta'; zoom = false; } }
    else if (P.weapons.torreta) { delete P.weapons.torreta; if (P.current === 'torreta') { P.current = ws[0]; P.other = ws[1] || ws[0]; } }
    P.nades = { frag: me.nd ? me.nd[0] : 0, sticky: me.nd ? me.nd[1] : 0 };
  }
  function syncSimple(map, rows, make, now, dur) {
    const seen = new Set();
    for (const [id, x, y, z, kind] of rows) { seen.add(id); let o = map.get(id); if (!o) { o = { m: make(kind), kind }; o.m.position.set(x, y, z); scene.add(o.m); map.set(id, o); } lerpTo(o, x, y, z, 0, now, dur); }
    for (const [id, o] of map) if (!seen.has(id)) { scene.remove(o.m); disposeTree(o.m); map.delete(id); }
  }
  const nameOf = (id) => (snap?.pl.find((r) => r[0] === id)?.[1]) || '?';
  const wname = (id) => L.WEAPONS[id]?.name || id;
  function event(e) {
    const k = e[0];
    if (k === 's') {
      if (e[1] === myId) return;
      const id = WIDS[e[9]] || 'rifle';
      if (id === 'laser') beam({ x: e[2], y: e[3] - 0.15, z: e[4] }, { x: e[5], y: e[6], z: e[7] });
      else tracer({ x: e[2], y: e[3] - 0.15, z: e[4] }, { x: e[5], y: e[6], z: e[7] }, TRACER[id]);
      if (e[8]) emit(e[5], e[6], e[7], 4, PICADO, { speed: 2, life: 0.4 });
      if (near(e[2], e[4], 30)) sfx('gun', id);
    } else if (k === 'sg') {
      if (e[1] === myId) return;
      const o = { x: e[2], y: e[3] - 0.15, z: e[4] }, w = L.WEAPONS[WIDS[e[8]]] || L.WEAPONS.escopeta;
      for (let i = 0; i < Math.min(6, w.pellets || 6); i++) { const d = { x: e[5] + (R() - 0.5) * 2 * w.spread, y: e[6] + (R() - 0.5) * 2 * w.spread, z: e[7] + (R() - 0.5) * 2 * w.spread }; tracer(o, { x: o.x + d.x * w.range, y: o.y + d.y * w.range, z: o.z + d.z * w.range }); }
      if (near(o.x, o.z, 30)) sfx('gun', WIDS[e[8]]);
    } else if (k === 'hm') { if (e[1] === myId) { if (e[2]) { headMark = 0.35; hitMark = 0.2; sfx('headshot'); } else { hitMark = 0.15; sfx('hitmark'); } } }
    else if (k === 'k') {
      const type = TYPES[e[2]];
      emit(e[3], e[4] + 1, e[5], 55, DEATH[type] || (type === 'padre' ? [...GOLD, ...MARIGOLD] : [...PICADO, ...MARIGOLD]), { speed: 5, up: 4, life: 1.6, g: DEATH[type] ? 2 : 7 });
      if (near(e[3], e[5], 40)) sfx('die', type === 'luchador' ? 'beast' : 'x');
      const how = e[7] === 'melee' ? ' (¡ZAS!)' : e[7] === 'grenade' ? ' (PIÑATA)' : e[7] === 'head' ? ' (¡CABEZA!)' : e[7] === 'jeep' ? ' (¡ATROPELLADO!)' : '';
      if (e[6]) feed(`${e[6] === myId ? 'TÚ' : nameOf(e[6])} ✶ ${NAME[type]}${how}`, e[6] === myId);
    }
    else if (k === 'x') explode(e[1], e[2], e[3], e[4] || 0);
    else if (k === 'h') {
      if (e[1] !== myId) return;
      if (e[5]) { shieldFlash = 1; sfx('shieldHit'); } else { hurtFlash = 1; sfx('hurt'); }
      if (e[6]) sfx('shieldDown');
      if (e[2] !== null) dirHit = { a: Math.atan2(e[2] - pos.x, e[3] - pos.z), life: 1 };
    }
    else if (k === 'pvp') feed(`${e[1] === myId ? 'TÚ' : nameOf(e[1])} ➜ ${e[2] === myId ? 'TÚ' : nameOf(e[2])}${e[3] === 'head' ? ' (¡CABEZA!)' : ''}`, e[1] === myId || e[2] === myId, 'pvp');
    else if (k === 'dn') feed(`${e[1] === myId ? 'TÚ' : nameOf(e[1])} CAYÓ`, e[1] === myId);
    else if (k === 'dd') feed(`${e[1] === myId ? 'TÚ' : nameOf(e[1])} SE DESANGRÓ`, e[1] === myId);
    else if (k === 'rv') feed(`${nameOf(e[2])} LEVANTÓ A ${e[1] === myId ? 'TI' : nameOf(e[1])}`, e[1] === myId || e[2] === myId);
    else if (k === 'j') feed(`${e[2]} ENTRÓ`);
    else if (k === 'l') feed(`${nameOf(e[1])} SALIÓ`);
    else if (k === 'bb') { const o = OPENINGS[e[1]]; if (near(o.x, o.z, 24)) sfx('crack'); }
    else if (k === 'br') { const o = OPENINGS[e[1]]; if (near(o.x, o.z, 24)) sfx('hammer'); emit(o.x, o.y0 + 1, o.z, 6, WOOD, { speed: 1.5, up: 1, life: 0.5 }); }
    else if (k === 'pk') { if (e[2] === myId) { sfx('pickup'); if (e[3] === 'sticky' || e[3] === 'frag') banner = { text: e[3] === 'sticky' ? '+1 PEGAJOSA' : '+1 PIÑATA', until: t + 1 }; } }
    else if (k === 'wave') { banner = { text: `OLEADA ${e[1]}`, until: t + 2.4 }; sfx('wave'); }
    else if (k === 'clear') { banner = { text: `¡OLEADA ${e[1]} LIMPIA!`, until: t + 3 }; sfx('pickup'); }
    else if (k === 'over') { banner = { text: '', until: 0 }; sfx('death'); }
    else if (k === 'new') { banner = { text: 'OTRA RONDA', until: t + 2 }; }
    else if (k === 'go') { banner = { text: '¡VÁMONOS!', until: t + 2 }; sfx('beep', true); }
    else if (k === 'tr') { banner = { text: `¡LLEGÓ LA TROCA! · ${wname(e[1])}`, until: t + 3 }; sfx('honk'); }
    else if (k === 'tg') {
      if (e[1] === myId) { banner = { text: `¡${wname(e[2])}!`, until: t + 1.8 }; sfx('pickup'); swapAnim = 1; }
      else feed(`${nameOf(e[1])} AGARRÓ ${wname(e[2])}`);
    }
    else if (k === 'tg0') { banner = { text: 'SE VA LA TROCA', until: t + 1.6 }; sfx('honk'); }
    else if (k === 'jp') { banner = { text: '¡LLEGÓ EL TORO!', until: t + 2.4 }; feed('EL TORO TE ESPERA EN EL CENTRO'); sfx('engine'); }
    else if (k === 'je') { feed(`${e[1] === myId ? 'TÚ' : nameOf(e[1])} ${e[2] === 'd' ? 'MANEJA EL TORO' : 'A LA TORRETA'}`, e[1] === myId); if (e[1] === myId) { sfx('engine'); zoom = false; } }
    else if (k === 'jx') { if (e[1] === myId) sfx('swap'); }
    else if (k === 'night') { banner = { text: 'CAE LA NOCHE…', until: t + 3 }; sfx('night'); }
    else if (k === 'sh') { const en = ents.en.get(e[1]); if (en && near(en.to.x, en.to.z, 60)) sfx(en.type === 'chupacabra' ? 'shriek' : en.type === 'lechuza' ? 'screech' : 'wail'); }
    else if (k === 'wl') { const en = ents.en.get(e[1]); if (en) { const c = en.to; if (near(c.x, c.z, 40)) { sfx('wail'); if (near(c.x, c.z, 10)) shake = Math.max(shake, 0.25); } emit(c.x, c.y + 1.6, c.z, 24, WISP, { speed: 3, up: 1, life: 1.4, g: -1, drag: 2 }); } }
    else if (k === 'bk') { const en = ents.en.get(e[1]); if (en) { const c = en.to; emit(c.x, c.y + 1, c.z, 30, WISP, { speed: 2, up: 2, life: 1, g: -2 }); if (near(c.x, c.z, 20)) sfx('wail'); } }
    else if (k === 'nh') { const en = ents.en.get(e[1]); if (en) { const c = en.to; emit(c.x, c.y + 0.8, c.z, 40, SMOKE, { speed: 3, up: 2, life: 1.2, g: -1 }); if (near(c.x, c.z, 35)) sfx(e[2] ? 'howl' : 'growl'); } }
    else if (k === 'cl') { const en = ents.en.get(e[1]); if (en && near(en.to.x, en.to.z, 20)) sfx('smack'); }
    else if (k === 'rk' || k === 'nd') { if (e[1] !== myId) { const p = ents.pl.get(e[1]); if (p && near(p.to.x, p.to.z, 35)) sfx('gun', k === 'rk' ? 'cohetes' : 'agujas'); } }
    else if (k === 'cb') { if (e[1] === myId) { banner = { text: '¡SUPERCOMBINADO!', until: t + 1.2 }; sfx('combine'); } }
    else if (k === 'st') { const g = ents.gr.get(e[1]); if (g && near(g.to.x, g.to.z, 30)) sfx('stick'); }
    else if (k === 'sw') { if (e[1] !== myId) { const p = ents.pl.get(e[1]); if (p && near(p.to.x, p.to.z, 15)) sfx('slash'); } }
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
  function roster() {
    if (!snap) return [];
    return snap.pl.filter((r) => !(r[7] & 8)).map((r) => ({ id: r[0], name: r[1], color: r[14], ready: !!r[18], host: r[0] === snap.host, me: r[0] === myId, look: r[19] }));
  }
  function info() {
    if (!snap) return;
    const ro = roster();
    const i = { players: ro.length, names: ro.map((r) => r.name), roster: ro, wave: snap.wv, phase: snap.ph, cd: snap.cd, joined, st: me?.st, last: snap.last || null, status,
      ready: !!me?.ready, host: !!me?.host, hostName: ro.find((r) => r.host)?.name || null, look: me?.look || null, myColor: ro.find((r) => r.me)?.color ?? null, seat: me?.seat || null, night: !!snap.nt };
    const key = JSON.stringify(i);
    if (key !== infoKey) { infoKey = key; onInfo(i); }
  }
  const setMode = (m, extra = {}) => { mode = m; onMode(m, extra); };
  function enterPlay() {
    vy = 0; banner = { text: snap?.ph === 'wave' ? `OLEADA ${snap.wv}` : '¡A DARLE!', until: t + 2 };
    setMode('playing'); info();
  }

  // ---- world queries for your own movement
  const fwd = () => new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const eye = () => ({ x: pos.x, y: pos.y + EYE, z: pos.z });
  function muzzleWorld() { const f = fwd(); const r = { x: Math.cos(yaw), z: -Math.sin(yaw) }; const o = eye(); return { x: o.x + f.x * 0.5 + r.x * 0.16, y: o.y + f.y * 0.5 - 0.14, z: o.z + f.z * 0.5 + r.z * 0.16 }; }
  const enemyCenter = (e, now) => { const c = cur(e, now); return { x: c.x, y: c.y + L.ENEMIES[e.type].height * 0.5, z: c.z }; };
  const enemyHead = (e, now) => { const c = cur(e, now); return L.headOf(e.type, c.x, c.y, c.z, c.yaw); };
  // what the crosshair is on: { d, head } (local guess; the server decides the real hits)
  function aimRay(o, d, maxD = 140) {
    let hitD = wallDist(o, d, maxD, bars), hit = null, head = false; const now = performance.now();
    for (const e of ents.en.values()) {
      const tb = L.raySphere(o, d, enemyCenter(e, now), L.ENEMIES[e.type].radius * 1.4), hd = enemyHead(e, now), th = L.raySphere(o, d, hd, hd.r);
      const hh = th < Infinity && th <= tb + 0.45 + L.ENEMIES[e.type].head.f * 1.4, tt = hh ? th : Math.min(tb, th); if (tt < hitD) { hitD = tt; hit = e; head = hh; }
    }
    for (const p of ents.pl.values()) { if (p.flags & 14) continue; const c = cur(p, now); const tb = L.raySphere(o, d, { x: c.x, y: c.y + 1, z: c.z }, 0.52), th = L.raySphere(o, d, { x: c.x, y: c.y + 1.62, z: c.z }, 0.27); const tt = Math.min(tb, th); if (tt < hitD) { hitD = tt; hit = p; head = th <= tb + 0.45; } }
    return { d: hitD, hit, head };
  }

  function shoot(id = P.current) {
    const w = L.WEAPONS[id];
    const o = eye(), f = fwd(); // aim first: the kick lands after the round is out
    sfx('gun', id); vmKick = 1; if (!reduceMotion) pitch = Math.min(1.45, pitch + (KICK[id] || 0.005) * (zoom ? 0.5 : 1));
    if (id === 'escopeta' || id === 'escopetita' || id === 'cohetes') shake = Math.max(shake, 0.12);
    const spread = (w.spread || 0) * (onGround ? 1 : 1.6) * (zoom ? 0.2 : 1);
    const aim = w.kind === 'pellets' || w.kind === 'rocket' || w.kind === 'needle' ? f.clone() : new THREE.Vector3(f.x + (R() - 0.5) * 2 * spread, f.y + (R() - 0.5) * 2 * spread, f.z + (R() - 0.5) * 2 * spread).normalize();
    if (w.kind === 'pellets') { // the server rolls the real spread; draw our own
      for (let i = 0; i < w.pellets; i++) {
        const d = new THREE.Vector3(f.x + (R() - 0.5) * 2 * w.spread, f.y + (R() - 0.5) * 2 * w.spread, f.z + (R() - 0.5) * 2 * w.spread).normalize();
        const r = aimRay(o, d, w.range * 1.6), hp = { x: o.x + d.x * r.d, y: o.y + d.y * r.d, z: o.z + d.z * r.d };
        tracer(muzzleWorld(), hp); if (r.hit) emit(hp.x, hp.y, hp.z, 3, PICADO, { speed: 2, up: 1, life: 0.4 }); else if (r.d < w.range * 1.6) emit(hp.x, hp.y, hp.z, 2, DUST, { speed: 1.5, up: 1, life: 0.5, g: 5 });
      }
    } else if (!w.kind || w.kind === 'beam') {
      const r = aimRay(o, aim, Math.min(220, (w.range || 140) * 1.5)), hp = { x: o.x + aim.x * r.d, y: o.y + aim.y * r.d, z: o.z + aim.z * r.d };
      if (w.kind === 'beam') { beam(muzzleWorld(), { x: o.x + aim.x * 160, y: o.y + aim.y * 160, z: o.z + aim.z * 160 }); shake = Math.max(shake, 0.2); }
      else tracer(muzzleWorld(), hp, TRACER[id]);
      if (r.hit) emit(hp.x, hp.y, hp.z, 6, id === 'chispas' ? [[0.5, 1, 0.4], [0.8, 1, 0.6]] : PICADO, { speed: 2.5, up: 1, life: 0.5 });
      else if (r.d < 140) emit(hp.x, hp.y, hp.z, 5, DUST, { speed: 1.5, up: 1.2, life: 0.6, g: 5 });
    }
    pending.push(['s', +o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2), +aim.x.toFixed(4), +aim.y.toFixed(4), +aim.z.toFixed(4)]);
  }
  function tracer(a, b, color = 0xffe08a) {
    const m = tracers[trNext]; trNext = (trNext + 1) % tracers.length;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
    m.material.color.setHex(color);
    m.position.set(a.x + dx / 2, a.y + dy / 2, a.z + dz / 2); m.scale.set(color === 0xffffff ? 2 : 1, color === 0xffffff ? 2 : 1, Math.max(0.01, len)); m.lookAt(b.x, b.y, b.z); m.visible = true; m.life = color === 0xffffff ? 0.18 : 0.05;
  }
  function beam(a, b) {
    const m = beams[bmNext]; bmNext = (bmNext + 1) % beams.length;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
    m.position.set(a.x + dx / 2, a.y + dy / 2, a.z + dz / 2); m.scale.set(1, 1, Math.max(0.01, len)); m.lookAt(b.x, b.y, b.z); m.visible = true; m.life = 0.3;
  }
  function throwNade() {
    const left = (k) => (P.nades[k] || 0) - spent[k];
    let kind = nadeKind; if (left(kind) <= 0) kind = kind === 'frag' ? 'sticky' : 'frag';
    if (left(kind) <= 0) { sfx('empty'); return; }
    spent[kind]++; sfx('throw');
    const o = eye(); pending.push(['g', +o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2), kind]);
  }
  function explode(x, y, z, kind = 0) {
    if (near(x, z, 45)) sfx(kind === 4 ? 'slam' : 'boom');
    const dd = Math.hypot(x - pos.x, z - pos.z); shake = Math.max(shake, Math.max(0, (kind === 4 ? 0.9 : 0.7) - dd / 25));
    const cols = kind === 1 ? BLUE : kind === 3 ? PINK : kind === 4 ? DUST : kind === 2 ? [...MARIGOLD, ...SMOKE] : [...PICADO, ...MARIGOLD, [1, 1, 1]];
    emit(x, y + 0.2, z, touch ? 110 : 170, cols, { speed: kind === 4 ? 7 : 9, up: kind === 4 ? 2 : 5, life: 2, g: 5, drag: 1.2 });
    const color = kind === 1 ? 0x7fe8ff : kind === 3 ? 0xff6ad0 : kind === 4 ? 0xd8b080 : 0xffd27a;
    const b = new THREE.Mesh(kind === 4 ? ringGeo : flashGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    b.position.set(x, kind === 4 ? terrain(x, z) + 0.15 : y, z); if (kind === 4) b.rotation.x = -Math.PI / 2;
    scene.add(b); blasts.push({ m: b, life: 0.3, big: kind === 4 ? 16 : 14 });
  }
  function bash() { // F: the stock smack with whatever is in hand
    if (!L.tryMelee(P, t)) return;
    swing = 0; sfx('whoosh'); pending.push(['m']);
  }
  // the machete and the hammer: pick the nearest thing in front within lunge range and close the gap fast
  function weaponSwing() {
    const id = P.current, w = L.WEAPONS[id], now = performance.now();
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let best = null, bd = (w.lunge || 0) + (w.reach || 2.6);
    const consider = (c) => { const dx = c.x - pos.x, dz = c.z - pos.z, d = Math.hypot(dx, dz); if (d < bd && d > 0.01 && (dx * fx + dz * fz) / d > 0.7 && Math.abs(c.y - pos.y) < 2.5) { bd = d; best = c; } };
    for (const e of ents.en.values()) consider(cur(e, now));
    for (const p of ents.pl.values()) if (!(p.flags & 14)) consider(cur(p, now));
    swing = 0;
    if (best && bd > w.reach * 0.75) {
      lunge = { x: best.x, z: best.z, stop: w.reach * 0.6, until: t + Math.min(0.32, (bd - w.reach * 0.6) / 20 + 0.05) };
      pending.push(['L']); sfx('lunge');
    } else land();
  }
  function land() {
    const w = L.WEAPONS[P.current]; lunge = null;
    pending.push(['m', 'w']); sfx(w.slam ? 'slam' : 'slash');
    if (w.slam) { shake = Math.max(shake, 0.5); swing = 0; }
  }

  // ---- input
  const PAD = touch;
  const onKeyDown = (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const k = e.code;
    if (mode === 'playing' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
    if (mode !== 'playing') { if (k === 'Enter' && mode === 'title') api.start(); return; }
    if (!input.keys.has(k)) { input.edges.add(k); if (k === 'KeyE') actTap = true; }
    input.keys.add(k);
  };
  const onKeyUp = (e) => input.keys.delete(e.code);
  const onMouseMove = (e) => { if (document.pointerLockElement === canvas && mode === 'playing') { input.look[0] += e.movementX; input.look[1] += e.movementY; } };
  const onMouseDown = (e) => {
    if (PAD || mode !== 'playing') return;
    if (e.button === 2) { if (L.WEAPONS[P.current]?.zoom) zoom = true; return; }
    if (e.button !== 0) return;
    input.fire = true; if (document.pointerLockElement !== canvas) lock();
  };
  const onMouseUp = (e) => { if (e.button === 0) input.fire = false; if (e.button === 2) zoom = false; };
  const onContext = (e) => e.preventDefault();
  const onWheel = () => { if (mode === 'playing') input.edges.add('Swap'); };
  let lockedOnce = false, unlockAt = 0;
  const lock = () => { try { const r = canvas.requestPointerLock?.(); if (r?.catch) r.catch(() => {}); } catch { /* not allowed here */ } };
  const onLockChange = () => {
    if (document.pointerLockElement === canvas) { lockedOnce = true; return; }
    unlockAt = performance.now(); input.fire = false; zoom = false;
    if (mode === 'playing' && lockedOnce) pause();
  };
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove); canvas.addEventListener('mousedown', onMouseDown); window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContext);
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
      on(b, 'pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); if (what === 'fire') { input.fire = true; lookStart(e); } else if (what === 'act') { input.act = true; actTap = true; } else input.edges.add(what); });
      on(b, 'pointermove', (e) => { if (what === 'fire') lookMove(e); });
      const up = (e) => { b.classList.remove('on'); if (what === 'fire') { input.fire = false; lookEnd(e); } if (what === 'act') input.act = false; };
      on(b, 'pointerup', up); on(b, 'pointercancel', up); on(b, 'contextmenu', (e) => e.preventDefault());
    }
  }

  // ---- HUD by ref
  const H = {}; for (const el of root.querySelectorAll('[data-h]')) H[el.dataset.h] = el;
  const prev = {};
  const set = (k, prop, v) => { const key = k + prop; if (prev[key] === v || !H[k]) return; prev[key] = v; if (prop === 'text') H[k].textContent = v; else if (prop === 'w') H[k].style.transform = `scaleX(${v})`; else if (prop.startsWith('.')) H[k].classList.toggle(prop.slice(1), v); else if (prop === 'rot') H[k].style.transform = `rotate(${v}rad)`; else if (prop === 'op') H[k].style.opacity = v; else if (prop.startsWith('--')) H[k].style.setProperty(prop, v); };
  function hud() {
    const id = P.current, s = P.weapons[id] || { mag: 0, reserve: 0 }, w = L.WEAPONS[id];
    set('shield', 'w', (P.shield / L.SHIELD.max).toFixed(3)); set('health', 'w', (P.health / L.HEALTH.max).toFixed(3));
    const down = P.shield <= 0.5, chargingS = P.shield < L.SHIELD.max && P.shield > 0.5;
    set('bars', '.down', down); set('bars', '.charging', chargingS && shieldFlash < 0.2); set('bars', '.flash', shieldFlash > 0.5);
    set('bars', '.low', P.health < 35);
    const melee = w.kind === 'melee', driving = me?.seat === 'd';
    set('mag', 'text', driving ? '—' : String(s.mag)); set('reserve', 'text', driving || melee || w.mounted ? (melee ? '⚡' : '') : String(s.reserve)); set('wname', 'text', driving ? 'EL TORO' : w.name);
    set('ammo', '.reloading', L.reloading(P, t)); set('ammo', '.empty', !driving && s.mag === 0 && (s.reserve === 0 || melee));
    const other = (me?.ws || []).find((q) => q !== id);
    set('slots', 'text', other && !me?.seat ? `${PAD ? '⇄' : 'Q'} ${L.WEAPONS[other].name}` : '');
    const f = Math.max(0, (P.nades.frag || 0) - spent.frag), st2 = Math.max(0, (P.nades.sticky || 0) - spent.sticky);
    set('nades', 'text', `${nadeKind === 'frag' ? '▸' : ' '}✶${f} ${nadeKind === 'sticky' ? '▸' : ' '}◆${st2}`);
    set('nadekind', 'text', nadeKind === 'frag' ? '✶ PIÑATA' : '◆ PEGAJOSA');
    set('score', 'text', (me?.pts ?? 0).toLocaleString()); set('wave', 'text', String(Math.max(1, snap?.wv || 1)));
    set('left', 'text', snap?.ph === 'wave' ? `${snap.left} EN CAMINO` : snap?.ph === 'break' ? `SIGUIENTE EN ${snap.cd}` : snap?.ph === 'truck' ? `LA TROCA · ${snap.cd}s` : '');
    set('count', 'text', `${snap ? snap.pl.filter((r) => !(r[7] & 8)).length : 0} EN LA CANCHA`);
    set('banner', 'text', t < banner.until ? banner.text : ''); set('banner', '.on', t < banner.until);
    const st = me?.st || 'alive';
    set('vig', '.hurt', hurtFlash > 0.15); set('vig', '.shield', shieldFlash > 0.15 && hurtFlash <= 0.15); set('vig', '.down', (down && st === 'alive') || st === 'downed');
    set('dir', 'op', dirHit ? dirHit.life.toFixed(2) : '0'); if (dirHit) set('dir', 'rot', (yaw - dirHit.a + Math.PI).toFixed(2));
    set('reticle', '.on', !driving && aimingAt()); set('reticle', '.pistol', id === 'pistol' || id === 'chispas'); set('reticle', '.hit', hitMark > 0); set('reticle', '.head', headMark > 0);
    set('reticle', '.wide', w.kind === 'pellets'); set('reticle', '.melee', melee); set('reticle', '.off', driving || zoom);
    set('reticle', '--charge', charging !== null ? Math.min(1, (t - charging) / (w.charge || 1)).toFixed(2) : '0');
    set('scope', '.on', zoom); set('zoombtn', '.show', !!w.zoom && !me?.seat);
    set('hs', '.on', headMark > 0);
    const pr = me?.pr, E = PAD ? 'ACCIÓN' : 'E', HOLD = PAD ? 'MANTÉN ACCIÓN' : 'MANTÉN E';
    const ptxt = !pr ? '' : pr.k === 'revive' ? `${HOLD} · LEVANTA A ${pr.label}` : pr.k === 'build' ? `${HOLD} · CLAVA TABLAS ${pr.label}` : pr.k === 'truck' ? `${E} · AGARRA ${pr.label}` : pr.k === 'jeep' ? `${E} · ${pr.label}` : pr.k === 'exit' ? `${E} · BAJAR` : `${E} · ${pr.label} ${pr.cost} PTS`;
    set('prompt', 'text', ptxt); set('prompt', '.on', !!pr && st === 'alive'); set('promptbar', 'w', pr && pr.p ? Math.min(1, pr.p).toFixed(2) : '0');
    set('actbtn', '.ready', !!pr && st === 'alive');
    set('down', '.on', st !== 'alive' && joined);
    set('down', 'text', st === 'downed' ? `¡CAÍSTE! QUE TE LEVANTEN · ${me.cd}` : st === 'dead' ? (snap?.ph === 'over' ? '' : 'VUELVES LA PRÓXIMA OLEADA') : '');
    set('bleed', '.on', st === 'downed'); set('bleed', '--k', st === 'downed' ? (me.cd / L.MATCH.downedSecs).toFixed(3) : '0');
  }
  function aimingAt() { const r = aimRay(eye(), fwd(), 60); return !!r.hit; }

  // ---- the loop
  function update(dt) {
    const alive = me?.st === 'alive', seat = me?.seat || null;
    const sens = (PAD ? 0.0042 : 0.0023) / (zoom ? (L.WEAPONS[P.current]?.zoom || 1) : 1);
    yaw -= input.look[0] * sens; pitch -= input.look[1] * sens; input.look[0] = input.look[1] = 0;
    if (input.keys.has('ArrowLeft')) yaw += 2.4 * dt; if (input.keys.has('ArrowRight')) yaw -= 2.4 * dt;
    pitch = Math.max(-1.45, Math.min(1.45, pitch));
    let mx = input.stick[0], mz = -input.stick[1];
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) mz += 1; if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) mz -= 1;
    if (input.keys.has('KeyD')) mx += 1; if (input.keys.has('KeyA')) mx -= 1;
    if (autopilot && !seat) { // test hook: walk to a spot
      const dx = autopilot.x - pos.x, dz = autopilot.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.4) autopilot = null; else { const lx = dx / d, lz = dz / d; mz = -(lx * Math.sin(yaw) + lz * Math.cos(yaw)); mx = lx * Math.cos(yaw) - lz * Math.sin(yaw); }
    }
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    if (seat === 'd' && veh) drive(dt, mz, mx);
    else if (seat) { const j = jeepNow(performance.now()); if (j) { const s = seatAt(j, seat); pos.x = s.x; pos.y = s.y; pos.z = s.z; } vy = 0; onGround = true; }
    else {
      if (alive) {
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        if (lunge) { // close the gap, then strike
          const dx = lunge.x - pos.x, dz = lunge.z - pos.z, d = Math.hypot(dx, dz), step = Math.min(Math.max(0, d - lunge.stop), 20 * dt);
          if (d > 0.01) { pos.x += dx / d * step; pos.z += dz / d * step; }
          if (d - step <= lunge.stop + 0.05 || t >= lunge.until) land();
        } else { pos.x += (fx * mz + rx * mx) * SPEED * dt; pos.z += (fz * mz + rz * mx) * SPEED * dt; }
        collide(pos, RADIUS, pos.y, 1.8, bars);
        const now = performance.now();
        for (const e of ents.en.values()) { const c = cur(e, now), dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = RADIUS + L.ENEMIES[e.type].radius * 0.9; if (d < m && d > 1e-4 && Math.abs(c.y - pos.y) < 1.5) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; } }
        if (jeepObj && !veh) { const j = cur(jeepObj, now), dx = pos.x - j.x, dz = pos.z - j.z, d = Math.hypot(dx, dz); if (d < 2 && d > 1e-4 && Math.abs(j.y - pos.y) < 1.6) { pos.x = j.x + dx / d * 2; pos.z = j.z + dz / d * 2; } }
        if ((input.edges.has('Space') || input.edges.has('jump')) && onGround) { vy = JUMP; onGround = false; }
      }
      // gravity. Stepping or jumping off a roof is just a drop: no fall damage, and the server lets you come down.
      vy -= GRAV * dt; pos.y += vy * dt;
      const gy = groundAt(pos.x, pos.z, pos.y, bars);
      if (pos.y <= gy) { pos.y = gy; vy = 0; onGround = true; } else if (pos.y - gy > 0.05) onGround = false;
    }
    if (alive && onGround && ml > 0.1 && !seat && !reduceMotion) bob += dt * 9; else bob *= 0.9;
    // weapons
    L.tickReload(P, t);
    const id = P.current, w = L.WEAPONS[id], s = P.weapons[id];
    if (zoom && !w?.zoom) zoom = false;
    if (alive && s && seat !== 'd') {
      if (input.edges.has('KeyR') || input.edges.has('reload')) { if (L.startReload(P, t)) { sfx('reload'); charging = null; burstQ = 0; } }
      if (!seat && (input.edges.has('KeyQ') || input.edges.has('Digit1') || input.edges.has('Digit2') || input.edges.has('Swap') || input.edges.has('swap'))) {
        const ws = me?.ws || [], want = input.edges.has('Digit1') ? ws[0] : input.edges.has('Digit2') ? ws[1] : null;
        if ((!want || want !== P.current) && P.other && P.weapons[P.other]) { L.swapWeapon(P); swapAnim = 1; sfx('swap'); zoom = false; charging = null; burstQ = 0; lunge = null; }
      }
      if (!seat && (input.edges.has('KeyT') || input.edges.has('nadekind'))) { nadeKind = nadeKind === 'frag' ? 'sticky' : 'frag'; sfx('swap'); }
      if (!seat && (input.edges.has('KeyG') || input.edges.has('grenade'))) throwNade();
      if (!seat && (input.edges.has('KeyF') || input.edges.has('melee'))) bash();
      if (PAD && input.edges.has('zoom') && w.zoom) zoom = !zoom;
      const cw = L.WEAPONS[P.current], cs = P.weapons[P.current];
      if (cw.kind === 'beam') { // hold to charge, it fires itself when full; let go early and it fizzles
        if (input.fire && charging === null && !input.fireHeld && cs.mag > 0 && !L.reloading(P, t) && t >= cs.nextShot) { charging = t; sfx('charge'); input.fireHeld = true; }
        if (charging !== null && !input.fire) charging = null;
        if (charging !== null && t - charging >= cw.charge) { charging = null; if (L.tryFire(P, t)) shoot(); }
        if (input.fire && cs.mag === 0 && t > emptyT) { if (!L.startReload(P, t)) sfx('empty'); else sfx('reload'); emptyT = t + 0.4; }
      } else if (cw.kind === 'melee') {
        if (input.fire && !input.fireHeld && !lunge) { if (L.tryFire(P, t)) weaponSwing(); else if (cs.mag === 0 && t > emptyT) { sfx('empty'); emptyT = t + 0.3; } input.fireHeld = true; }
      } else if (input.fire && (cw.auto || !input.fireHeld) && swing < 0 && burstQ === 0) {
        const wasReloading = L.reloading(P, t);
        if (L.tryFire(P, t)) { shoot(); if (cw.burst) { burstQ = Math.min(cw.burst - 1, cs.mag); burstT = t + cw.burstGap; } }
        else if (cs.mag === 0 && cs.reserve === 0 && !cw.mounted && t > emptyT) { sfx('empty'); emptyT = t + 0.3; }
        else if (!wasReloading && L.reloading(P, t)) sfx('reload');
        if (!cw.auto) input.fireHeld = true;
      }
      if (burstQ > 0 && t >= burstT) { if (cs.mag > 0 && !L.reloading(P, t)) { cs.mag--; shoot(); burstQ--; burstT = t + cw.burstGap; if (cs.mag === 0) L.startReload(P, t); } else burstQ = 0; }
    }
    if (!input.fire) input.fireHeld = false;
    input.edges.clear();
    if (P.shield <= 0.5 && alive && t > alarmT) { sfx('alarm'); alarmT = t + 0.6; }
    hurtFlash = Math.max(0, hurtFlash - dt * 2.5); shieldFlash = Math.max(0, shieldFlash - dt * 3); hitMark = Math.max(0, hitMark - dt); headMark = Math.max(0, headMark - dt);
    if (dirHit) { dirHit.life -= dt; if (dirHit.life <= 0) dirHit = null; }
  }
  // EL TORO, from the driver's seat: arcade handling, checked by the server like your feet are
  function drive(dt, throttle, steer) {
    const v = veh;
    if (throttle > 0.05) v.spd += (v.spd < 0 ? JEEP.brake : JEEP.accel) * throttle * dt;
    else if (throttle < -0.05) v.spd += (v.spd > 0 ? -JEEP.brake : -JEEP.accel * 0.7) * -throttle * dt;
    else v.spd -= Math.sign(v.spd) * Math.min(Math.abs(v.spd), JEEP.drag * 3 * dt);
    v.spd = Math.max(-JEEP.rev, Math.min(JEEP.top, v.spd));
    const grip = Math.min(1, Math.abs(v.spd) / 4) * Math.sign(v.spd || 1);
    v.yaw -= steer * JEEP.steer * grip * dt;
    const nx = v.x - Math.sin(v.yaw) * v.spd * dt, nz = v.z - Math.cos(v.yaw) * v.spd * dt;
    const q = { x: Math.max(BOUNDS.x0 + 1, Math.min(BOUNDS.x1 - 1, nx)), z: Math.max(BOUNDS.z0 + 1, Math.min(BOUNDS.z1 - 1, nz)) };
    const gy = groundAt(q.x, q.z, v.y + 0.6, bars);
    collide(q, 1.0, gy, 1.6, bars);
    if (Math.hypot(q.x - nx, q.z - nz) > 0.05) v.spd *= 0.5; // scraped a wall
    if (Math.abs(gy - v.y) > 1.1) { v.spd = 0; } else { v.x = q.x; v.z = q.z; v.y = gy; }
    const s = seatAt(v, 'd'); pos.x = s.x; pos.y = s.y; pos.z = s.z;
    if (Math.abs(v.spd) > 2 && t > engineT) { sfx('engine'); engineT = t + 0.45; }
    if (Math.abs(v.spd) > 6 && R() < dt * 20) emit(v.x + Math.sin(v.yaw) * 1.8, v.y + 0.2, v.z + Math.cos(v.yaw) * 1.8, 2, DUST, { speed: 1, up: 1, life: 0.7, g: 1 });
  }
  function sendInput(now) {
    if (!joined || now - sendT < SEND_MS) return;
    sendT = now;
    const act = input.act || input.keys.has('KeyE') || actTap; // a quick tap still reaches the server once
    const msg = { p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)], yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), w: P.current, wv: wvSeen, act, ev: pending }; // wv: which weapon list our pick refers to
    if (veh) msg.veh = [+veh.x.toFixed(2), +veh.y.toFixed(2), +veh.z.toFixed(2), +veh.yaw.toFixed(3)];
    if (sender.send(msg)) { pending = []; actTap = false; }
    else if (pending.length > 40) pending = pending.slice(-40);
  }

  function animate(dt, now) {
    const tt = now / 1000;
    for (const e of ents.en.values()) {
      const c = cur(e, now), m = e.m, ty = e.type;
      const moved = Math.hypot(e.to.x - e.from.x, e.to.z - e.from.z) / (e.dur / 1000);
      m.root.position.set(c.x, c.y, c.z); m.root.rotation.y = c.yaw;
      e.phase += dt * Math.min(ty === 'chupacabra' ? 18 : 9, moved * 2.2 + 0.3);
      const sw = Math.sin(e.phase) * Math.min(ty === 'chupacabra' ? 1.1 : 0.8, moved * 0.25);
      const st = e.st;
      if (m.kind === 'nahual') { const wolf = !!(e.extra & 1); m.wolf.root.visible = wolf; m.man.root.visible = !wolf; m.legs = wolf ? m.wolf.legs : m.man.legs; m.arms = wolf ? m.wolf.arms : m.man.arms; m.quadNow = wolf; }
      const quad = m.kind === 'quad' || m.quadNow;
      m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
      m.root.rotation.x = st === 'tackle' ? -0.45 : st === 'swoop' ? 0.5 : 0; m.root.rotation.z = 0;
      if (quad) { m.arms[0].rotation.x = -sw; m.arms[1].rotation.x = sw; }
      else if (m.kind === 'fly') { const f = Math.sin(tt * (st === 'swoop' ? 6 : 13) + e.seed); m.arms[0].rotation.z = f * 0.7; m.arms[1].rotation.z = -f * 0.7; m.root.position.y += Math.sin(tt * 3 + e.seed) * 0.15; }
      else if (m.kind === 'float') { m.root.position.y += Math.sin(tt * 1.6 + e.seed) * 0.12; const up = st === 'wail' ? -2.6 : -1.35 + Math.sin(tt * 2 + e.seed) * 0.1; m.arms[0].rotation.x = up; m.arms[1].rotation.x = up; m.mats[0].opacity = 0.6 + 0.3 * Math.abs(Math.sin(tt * 7.3 + e.seed)) * (Math.sin(tt * 1.3) > 0.7 ? 0.3 : 1); }
      else if (st === 'climb') { const a = Math.sin(tt * 10 + e.seed); m.arms[0].rotation.x = -2.6 + a * 0.4; m.arms[1].rotation.x = -2.6 - a * 0.4; m.legs[0].rotation.x = a * 0.5; m.legs[1].rotation.x = -a * 0.5; }
      else if (st === 'hit' || st === 'tear') { const a = Math.sin(tt * 14 + e.seed); m.arms[0].rotation.x = -1.3 + a * 0.6; m.arms[1].rotation.x = -1.3 - a * 0.6; }
      else if (st === 'shoot') { m.arms[1].rotation.x = -1.5; m.arms[0].rotation.x = -0.9; }
      else if (st === 'bless') { m.arms[0].rotation.x = -2.7; m.arms[1].rotation.x = -2.7; }
      else if (st === 'tackle') { m.arms[0].rotation.x = -1.6; m.arms[1].rotation.x = -1.6; }
      else if (ty === 'mariachi' && moved < 0.5) { m.arms[1].rotation.x = -1.2 + Math.sin(tt * 3 + e.seed) * 0.15; m.arms[0].rotation.x = -0.4; }
      else { m.arms[0].rotation.x = -sw * 0.8; m.arms[1].rotation.x = ty === 'granjero' ? -0.5 : ty === 'cucuy' ? -0.6 - sw * 0.5 : sw * 0.8; }
      if (ty === 'padre') m.arms[0].rotation.z = Math.sin(tt * 2 + e.seed) * 0.3; // the censer swings
      if (ty === 'chupacabra') { // jerky: every so often it twitches, snaps its head round, freezes
        e.jt -= dt; if (e.jt <= 0) { e.jt = 0.12 + R() * 0.5; e.jx = (R() - 0.5) * 0.5; e.jz = (R() - 0.5) * 0.35; }
        m.root.rotation.z = e.jz; m.root.rotation.y += e.jx; m.root.position.y += Math.abs(Math.sin(e.phase)) * 0.12;
      }
      if (e.extra & 4 && R() < dt * 10) emit(c.x, c.y + 1.4, c.z, 1, BLUE, { speed: 1, up: 1, life: 0.4, g: 0 });
      if (e.haste && R() < dt * 6) emit(c.x, c.y + 1.2, c.z, 1, GOLD, { speed: 0.5, up: 1, life: 0.6, g: -1 });
      if (e.flash > 0) { e.flash = Math.max(0, e.flash - dt * 6); for (const mt of m.mats) mt.emissive.setScalar(e.flash * 0.6); }
      if (m.eyes && nightK > 0.3 && R() < dt * 0.3) m.eyes.visible = false; else if (m.eyes && !m.eyes.visible && R() < dt * 8) m.eyes.visible = true; // they blink
    }
    for (let i = dying.length - 1; i >= 0; i--) { const d = dying[i]; d.life -= dt; d.m.root.scale.multiplyScalar(0.88); d.m.root.rotation.y += dt * 12; d.m.root.position.y += dt * 2; if (d.life <= 0) { scene.remove(d.m.root); disposeTree(d.m.root); dying.splice(i, 1); } }
    for (const p of ents.pl.values()) {
      const c = cur(p, now), m = p.m, f = p.flags || 0;
      m.root.visible = !(f & 4);
      m.root.position.set(c.x, c.y, c.z); m.root.rotation.y = c.yaw;
      const downed = !!(f & 2), seated = !!p.seat;
      m.body.rotation.x = downed ? -1.35 : 0; m.body.position.y = downed ? 0.3 : 0; m.tag.position.y = downed ? 1.2 : 2.95;
      m.tag.visible = !(seated && me?.seat); // riding together: no name tag in your face
      if (f & 1 && !downed && !seated) p.phase += dt * 9; const sw = f & 1 && !downed && !seated ? Math.sin(p.phase) * 0.6 : 0;
      m.legs[0].rotation.x = seated ? -1.4 : sw; m.legs[1].rotation.x = seated ? -1.4 : -sw;
      m.arms[1].rotation.x = f & 16 || p.seat === 2 ? -1.5 - (p.pitch || 0) : -0.9; m.arms[0].rotation.x = f & 16 || seated ? -1.2 : -sw * 0.6;
      // the bleed-out ring over a downed friend
      if (downed) {
        if (!p.ring) { p.ring = makeBleedRing(); scene.add(p.ring); }
        p.ring.visible = true; p.ring.position.set(c.x, c.y + 1.5, c.z); p.ring.quaternion.copy(camera.quaternion); setBleed(p.ring, (p.bleed || 0) / 100);
      } else if (p.ring) p.ring.visible = false;
    }
    for (const o of ents.pj.values()) { const c = cur(o, now); o.m.position.set(c.x, c.y, c.z); o.m.rotation.y += dt * 8; o.m.rotation.x += dt * 5; }
    for (const o of ents.gr.values()) { const c = cur(o, now); o.m.position.set(c.x, c.y, c.z); if (o.kind !== 1) { o.m.rotation.y += dt * 8; o.m.rotation.x += dt * 5; } else o.m.rotation.y += dt * 3; }
    for (const o of ents.pr.values()) {
      const c = cur(o, now); o.m.position.set(c.x, c.y, c.z);
      if (Math.hypot(o.to.x - o.from.x, o.to.y - o.from.y, o.to.z - o.from.z) > 0.01) o.m.lookAt(o.from.x, o.from.y, o.from.z);
      if (o.kind === 0 && R() < dt * 40) emit(c.x, c.y, c.z, 1, SMOKE, { speed: 0.4, up: 0.5, life: 0.8, g: -0.5 });
    }
    let i = 0; for (const k of ents.pk.values()) { k.m.rotation.y += dt * 1.6; k.m.position.y = k.y + 0.15 + Math.sin(now / 330 + i++) * 0.08; }
    for (const s of world.stations) s.children[0].rotation.y = Math.sin(now / 900) * 0.06;
    // the truck rolls through, the gun on offer spins over the bed
    if (truckObj) {
      const c = cur(truckObj, now); truck.root.position.set(c.x, c.y + (truckObj.stopped ? 0 : Math.abs(Math.sin(tt * 9)) * 0.04), c.z); truck.root.rotation.y = c.yaw;
      truck.show.rotation.y += dt * 1.8; truck.show.position.y = 3.6 + Math.sin(tt * 2) * 0.12;
      if (!truckObj.stopped && near(c.x, c.z, 30) && t > engineT) { sfx('engine'); engineT = t + 0.6; }
    }
    const j = jeepNow(now);
    if (j) {
      jeep.root.position.set(j.x, j.y, j.z); jeep.root.rotation.y = j.yaw;
      const ty = me?.seat === 'g' ? yaw : jeepObj?.ty ?? j.yaw, tp = me?.seat === 'g' ? pitch : jeepObj?.tp ?? 0;
      jeep.turret.rotation.set(0, 0, 0); jeep.turret.rotation.order = 'YXZ'; jeep.turret.rotation.y = ty - j.yaw; jeep.turret.rotation.x = tp;
      jeep.turret.visible = me?.seat !== 'g';
    }
    world.night?.tick(tt);
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
    for (const b of beams) if (b.visible) { b.life -= dt; b.material.opacity = Math.max(0, b.life / 0.3); const s = 0.4 + b.life * 3; b.scale.x = s; b.scale.y = s; if (b.life <= 0) b.visible = false; }
    for (let i = blasts.length - 1; i >= 0; i--) { const b = blasts[i]; b.life -= dt; b.m.scale.setScalar(1 + (0.3 - b.life) * b.big); b.m.material.opacity = Math.max(0, b.life / 0.3) * 0.8; if (b.life <= 0) { scene.remove(b.m); b.m.material.dispose(); blasts.splice(i, 1); } }
    world.water.material.emissive.setRGB(0.04, 0.2 + Math.sin(performance.now() / 400) * 0.04, 0.25);
    // night falls (or lifts) over a few seconds
    if (Math.abs(nightK - nightTarget) > 0.001) { nightK += Math.sign(nightTarget - nightK) * Math.min(Math.abs(nightTarget - nightK), dt / 3.5); world.night?.set(nightK); }
  }

  function placeCamera(dt) {
    vmRig.visible = false;
    const baseFov = camera.userData.base || 70;
    const wantFov = zoom ? baseFov / (L.WEAPONS[P.current]?.zoom || 1) : baseFov;
    if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 18); camera.updateProjectionMatrix(); }
    if (overview) { camera.position.set(34, 58, 66); camera.lookAt(-2, 0, 6); return; }
    if (mode === 'title' || mode === 'loading' || mode === 'lobby' || !joined) {
      const a = performance.now() / 14000;
      camera.position.set(Math.sin(a) * 26, 22, Math.cos(a) * 46); camera.lookAt(0, 1, Math.cos(a) * 12); return;
    }
    const st = me?.st || 'alive';
    const sh = reduceMotion ? 0 : shake; shake = Math.max(0, shake - dt * 2);
    if (me?.seat === 'd' && veh) { // chase camera behind EL TORO
      const back = 7.5, cx = veh.x + Math.sin(veh.yaw) * back, cz = veh.z + Math.cos(veh.yaw) * back;
      const cy = Math.max(veh.y + 3.4, groundAt(cx, cz, veh.y + 6, bars) + 1.2);
      camera.position.set(cx + (R() - 0.5) * sh * 0.2, cy, cz);
      camera.lookAt(veh.x - Math.sin(veh.yaw) * 4, veh.y + 1.2, veh.z - Math.cos(veh.yaw) * 4);
      return;
    }
    const by = Math.sin(bob) * 0.04, bx = Math.cos(bob * 0.5) * 0.03;
    const lift = st === 'downed' ? -1.05 : st === 'dead' ? 2.5 : 0;
    camera.position.set(pos.x + (R() - 0.5) * sh * 0.2, pos.y + EYE + by + lift + (R() - 0.5) * sh * 0.2, pos.z);
    camera.rotation.set(st === 'dead' ? Math.min(pitch, -0.5) : pitch, yaw, st === 'downed' ? 0.3 : 0);
    if (st !== 'alive' || zoom) return;
    vmRig.visible = true;
    const c = P.current, home = vm.home[c] || vm.home.rifle;
    for (const [id, g] of Object.entries(vm.guns)) g.visible = id === c;
    vmKick = Math.max(0, vmKick - dt * 14); swapAnim = Math.max(0, swapAnim - dt * 4);
    const ws = P.weapons[c];
    const rl = L.reloading(P, t) && ws ? Math.sin(Math.min(1, (ws.reloadUntil - t) / L.WEAPONS[c].reload) * Math.PI) : 0;
    let sw = 0; if (swing >= 0) { swing += dt; sw = Math.sin(Math.min(1, swing / 0.3) * Math.PI); if (swing > 0.3) swing = -1; }
    const melee = L.WEAPONS[c].kind === 'melee', lg = lunge ? 1 : 0;
    const building = me?.pr?.k === 'build' && (input.act || input.keys.has('KeyE')) ? Math.abs(Math.sin(performance.now() / 90)) : 0; // hammering
    const chg = charging !== null ? Math.min(1, (t - charging) / (L.WEAPONS[c].charge || 1)) : 0;
    const g = vm.guns[c];
    g.position.set(home.x + bx * 0.5 - sw * (melee ? 0.25 : 0.12) + (R() - 0.5) * chg * 0.01, home.y + by * 0.5 - rl * 0.18 - swapAnim * 0.3 - building * 0.1 + lg * 0.08, home.z + vmKick * 0.05 - sw * 0.25 - lg * 0.1);
    g.rotation.set(rl * 0.5 + vmKick * (KICK[c] || 0.005) * 10 - sw * (melee ? 1.2 : 0.4) + building * 0.5 + lg * 0.5, 0.06 + sw * (melee ? 1.0 : 0.6), rl * 0.3 + (melee ? sw * 0.6 : 0));
    vm.flash.visible = vmKick > 0.6 && !melee; if (vm.flash.visible) { g.updateMatrix(); vm.flash.position.copy(vm.muzzle[c]).applyMatrix4(g.matrix); vm.flash.rotation.set(0, g.rotation.y, R() * 3); vm.flash.material.color.setHex(c === 'chispas' ? 0x7dff5a : c === 'agujas' ? 0xff4fc0 : c === 'laser' ? 0xff3040 : 0xffd060); }
  }

  // the lobby preview draws into the rectangle the panel left for it
  function renderPreview(now) {
    const el = (mode === 'title' || mode === 'lobby' || mode === 'loading') && root.querySelector('[data-preview]');
    if (!el || !pvModel) return;
    const cr = canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
    const x = r.left - cr.left, y = r.top - cr.top, w = r.width, h = r.height;
    if (w < 20 || h < 20) return;
    pvSpin.rotation.y = now / 1600;
    pvModel.legs[0].rotation.x = Math.sin(now / 500) * 0.05; pvModel.arms[0].rotation.x = Math.sin(now / 700) * 0.1;
    pvCam.aspect = w / h; pvCam.fov = w / h < 0.8 ? 38 : 30; pvCam.updateProjectionMatrix();
    renderer.setScissorTest(true); renderer.setViewport(x, cr.height - y - h, w, h); renderer.setScissor(x, cr.height - y - h, w, h);
    renderer.clearDepth(); renderer.render(pvScene, pvCam);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, cr.width, cr.height);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    t += dt;
    fpsT += dt; fpsN++; if (fpsT >= 1) { fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
    if (joined && (mode === 'playing' || mode === 'paused')) { if (mode === 'playing') update(dt); else if (!me?.seat) { vy -= GRAV * dt; pos.y += vy * dt; const gy = groundAt(pos.x, pos.z, pos.y, bars); if (pos.y <= gy) { pos.y = gy; vy = 0; } } sendInput(now); }
    else if (joined && mode === 'lobby') sendInput(now);
    animate(dt, now);
    effects(dt);
    placeCamera(dt);
    resize();
    renderer.clear(); renderer.render(scene, camera);
    if (vmRig.visible && (mode === 'playing' || mode === 'paused')) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
    renderPreview(now);
    if (joined && (mode === 'playing' || mode === 'paused')) hud();
    frames++;
  }
  let W = 0, Hh = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h || (w === W && h === Hh)) return; W = w; Hh = h;
    renderer.setSize(w, h, false);
    const a = w / h, deg = Math.PI / 180, base = touch ? 74 : 70;
    camera.aspect = a; camera.userData.base = a >= 1 ? base : Math.min(98, 2 * Math.atan(Math.tan(36 * deg) / a) / deg); camera.fov = camera.userData.base; camera.updateProjectionMatrix();
    vmCam.aspect = a; vmCam.fov = a >= 1 ? 55 : 2 * Math.atan(Math.tan(31 * deg) / a) / deg; vmCam.updateProjectionMatrix();
  }
  function pause() { if (mode !== 'playing') return; input.fire = false; input.act = false; input.keys.clear(); zoom = false; setMode('paused'); }
  function disposeTree(o) { if (o.userData?.shared) return; o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material?.map) c.material.map.dispose(); }); }

  const net = connect({ onSnap, onStatus: (s) => { status = s; info(); if (s === 'replaced') { joined = false; setMode('title', { note: 'Opened in another tab.' }); } } });
  onMode('loading', {});
  setPreview(L.DEFAULT_LOOK);
  raf = requestAnimationFrame(frame);

  const api = {
    // join the match. In the lobby you wait there (pick your look, get ready); a match already running drops you in.
    async start() {
      if (joining || mode === 'playing') return;
      if (audio) { audio.resume(); audio.music(true); }
      if (joined) { if (snap?.ph === 'lobby') setMode('lobby'); else { if (!PAD) lock(); setMode('playing'); } return; }
      joining = true;
      const r = await join().catch(() => ({ ok: false, data: { error: 'No connection to the canyon.' } }));
      joining = false;
      if (!r.ok) { if (document.pointerLockElement) document.exitPointerLock?.(); setMode('title', { note: r.data?.error || 'Could not get in.' }); return; }
      const m = r.data.me; myId = m.id; me = m; joined = true; lastAg = m.ag; P = L.createPlayer(m.ws || L.START_WEAPONS); wvSeen = -1; prevSt = m.st; syncWeapons();
      if (m.corr) { pos = { x: m.corr[0], y: m.corr[1], z: m.corr[2] }; if (m.corr.length > 3) yaw = m.corr[3]; }
      pitch = 0; vy = 0;
      if (!snap || snap.ph === 'lobby' || snap.ph === 'idle') { setMode('lobby'); info(); return; }
      if (!PAD) lock();
      enterPlay();
    },
    async ready(onOff) { const r = await post('/ready', { ready: !!onOff }).catch(() => null); return r?.ok; },
    async begin() { const r = await post('/begin').catch(() => null); return r?.ok ? true : (r?.data?.error || false); },
    async leaveLobby() { if (!joined) return; await leave().catch(() => {}); joined = false; setMode('title'); },
    setLook(look, color) { setPreview(look, color ?? pvColor); },
    resume() { if (mode !== 'paused') return; setMode('playing'); if (audio) { audio.resume(); audio.music(true); } if (!PAD) lock(); },
    pause,
    get mode() { return mode; },
    justUnlocked: () => performance.now() - unlockAt < 400,
    locked: () => document.pointerLockElement === canvas,
    setMuted(m) { muted = m; if (audio) audio.setMuted(m); },
    setMusicLevel(i) { if (audio) { audio.resume(); audio.music(true); return audio.setMusicLevel(i); } return i; },
    musicPlaying: () => !!audio?.musicPlaying,
    board() {
      if (!snap) return [];
      return snap.pl.map((r) => ({ id: r[0], name: r[1], kills: r[10], pvp: r[11], deaths: r[12], score: r[13], heads: r[20] || 0, color: PLAYER_COLORS[r[14] % PLAYER_COLORS.length], me: r[0] === myId, away: !!(r[7] & 8), downed: !!(r[7] & 2), dead: !!(r[7] & 4) }))
        .sort((a, b) => b.score - a.score);
    },
    // read-outs + hooks for the browser checks
    state: () => ({ mode, joined, myId, st: me?.st, wave: snap?.wv || 0, phase: snap?.ph, left: snap?.left, pts: me?.pts, shield: Math.round(P.shield), health: Math.round(P.health),
      grenades: (P.nades.frag || 0) - spent.frag, sticky: (P.nades.sticky || 0) - spent.sticky, nadeKind,
      weapon: P.current, slots: me?.ws || [], mag: P.weapons[P.current]?.mag ?? 0, reserve: P.weapons[P.current]?.reserve ?? 0, pos: { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2) }, yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), onGround,
      enemies: ents.en.size, enemyTypes: [...ents.en.values()].map((e) => e.type), others: [...ents.pl.values()].map((p) => p.name), othersAt: [...ents.pl.values()].map((p) => ({ name: p.name, ...cur(p, performance.now()), flags: p.flags, look: p.look })),
      bars: bars.slice(), prompt: me?.pr || null, fps: Math.round(fps), frames, status, audio: audio ? audio.ctx.state : 'none', music: !!audio?.musicPlaying,
      truck: truckObj ? { ...cur(truckObj, performance.now()), weapon: WIDS[truckGunIdx] } : null, jeep: jeepObj ? { ...jeepNow(performance.now()), driver: jeepObj.driver, gunner: jeepObj.gunner } : null, seat: me?.seat || null,
      night: nightK, nightOn: !!snap?.nt, ready: !!me?.ready, host: !!me?.host, look: me?.look || null, roster: roster(), zoom, headMark: headMark > 0, hitMark: hitMark > 0, lunging: !!lunge,
      pickups: [...ents.pk.values()].length, projectiles: ents.pr.size, nadesLive: ents.gr.size }),
    aimAt(x, y, z) { const o = eye(); yaw = Math.atan2(-(x - o.x), -(z - o.z)); pitch = Math.atan2(y - o.y, Math.hypot(x - o.x, z - o.z)); },
    aimAtNearest(head = false) { const now = performance.now(); const e = [...ents.en.values()].sort((a, b) => Math.hypot(a.to.x - pos.x, a.to.z - pos.z) - Math.hypot(b.to.x - pos.x, b.to.z - pos.z))[0]; if (!e) return false; const c = head ? enemyHead(e, now) : enemyCenter(e, now); api.aimAt(c.x, c.y, c.z); return true; },
    aimAtPlayer(name, head = false) { const p = [...ents.pl.values()].find((q) => q.name === name); if (!p) return false; const c = cur(p, performance.now()); api.aimAt(c.x, c.y + (head ? 1.62 : 1), c.z); return true; },
    face(yw, pt = 0) { yaw = yw; pitch = pt; },
    walkTo(x, z) { autopilot = { x, z }; },
    fire(onOff) { input.fire = !!onOff; if (!onOff) input.fireHeld = false; },
    act(onOff) { input.act = !!onOff; },
    press(what) { input.edges.add(what); },
    hold(code, onOff) { if (onOff) { if (!input.keys.has(code)) input.edges.add(code); input.keys.add(code); } else input.keys.delete(code); },
    setZoom(onOff) { zoom = !!onOff && !!L.WEAPONS[P.current]?.zoom; },
    overview(onOff) { overview = !!onOff; },
    dispose() {
      cancelAnimationFrame(raf);
      if (joined) leave().catch(() => {});
      net.close();
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown); window.removeEventListener('mouseup', onMouseUp); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('contextmenu', onContext);
      document.removeEventListener('pointerlockchange', onLockChange);
      offs.forEach((f) => f());
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      if (audio) audio.close();
      if (truckGun) truck.show.remove(truckGun);
      for (const sc of [scene, vmScene, pvScene]) sc.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose(); x.dispose(); }); });
      renderer.dispose();
    },
  };
  return api;
}

function angLerp(a, b, k) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; }
