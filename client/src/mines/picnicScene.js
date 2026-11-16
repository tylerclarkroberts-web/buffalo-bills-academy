// three.js renderer for the company picnic: an open quarry under a bad sky, the other miners, and what you are holding.
// The ground, the boulders, the guns, the pickups and what a shot hits come from server/engine/picnic-map.js, which
// the server shares.
import * as THREE from 'three';
import { GROUND, ROCKS, GUNS, PICKUPS, heightAt, walk, shoot } from '../../../server/engine/picnic-map.js';
import { OtherMiners } from './miners.js';

const TURN = 2.3, TRACER_S = 0.12, BLAST_S = 0.4, SCOPE = 0.62; // SCOPE: how much of the view the surveyor takes away
const COLOR = { rivet: '#7dff3a', stapler: '#e23b2a', surveyor: '#d8b24a', dynamite: '#ff8a1a', hat: '#e8b923', salad: '#f2e8b0' };
const BARREL = { rivet: 1, stapler: 0.75, surveyor: 1.8, dynamite: 1.2 }; // how long each gun is in your hand
const flat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

/** A painted board `w` metres wide: lines of text on a canvas, readable from both sides. */
function board(lines, w, { bg, fg, px = 512, py = 128 }) {
  const c = Object.assign(document.createElement('canvas'), { width: px, height: py }), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, px, py);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([text, size], i) => { g.font = `bold ${size}px monospace`; g.fillText(text, px / 2, (py * (i + 0.5)) / lines.length + (i ? -6 : 6), px - 24); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * py) / px), new THREE.MeshBasicMaterial({ map: t })), back = face.clone();
  back.rotation.y = Math.PI;
  return new THREE.Group().add(face, back);
}

/** Something to walk over: big enough to spot across the quarry, on a ring of its own colour. */
function pickup(kind) {
  const g = new THREE.Group(), item = new THREE.Group(), paint = flat(COLOR[kind]), steel = flat('#3a3d3a');
  if (kind === 'hat') item.add(mesh(new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), paint), mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 12), paint, 0, 0, 0.05));
  else if (kind === 'salad') item.add(mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flat('#d9d4c4'), 0, 0.3, 0), mesh(new THREE.SphereGeometry(0.26, 8, 5), paint, 0, 0.3, 0));
  else if (kind === 'dynamite') for (const x of [-0.11, 0, 0.11]) item.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), paint, x, 0.1, 0));
  else item.add(mesh(new THREE.BoxGeometry(0.1, 0.14, 0.6 * BARREL[kind]), steel), mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), steel, 0, -0.15, 0.12), mesh(new THREE.BoxGeometry(0.12, 0.1, 0.24), paint, 0, 0.1, 0.05));
  item.position.y = kind === 'salad' ? 0.82 : 0.75; // the salad is on its table; the rest hang in the air and turn
  const ring = mesh(new THREE.RingGeometry(0.55, 0.75, 20), new THREE.MeshBasicMaterial({ color: COLOR[kind], side: THREE.DoubleSide }), 0, 0.06, 0); ring.rotation.x = -Math.PI / 2;
  g.add(item, ring); if (kind !== 'salad') g.userData.turns = item;
  return g;
}

export class PicnicScene {
  constructor(canvas, { reduceMotion = false, onEvent } = {}) {
    this.reduce = reduceMotion; this.onEvent = onEvent;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.scale = 0.5; // still chunky, but sharper than the tunnels: people are a long way off out here
    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#c9c08a', 40, 170);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 500); scene.add(this.camera);
    scene.add(new THREE.HemisphereLight('#e9f0c4', '#5a4526', 1.5));
    const sun = new THREE.DirectionalLight('#fff3c4', 1.6); sun.position.set(-120, 70, -90); scene.add(sun);

    // The sky: sulphur haze at the rim, something teal and unwell overhead, and a sun that is too big.
    const dome = new THREE.SphereGeometry(400, 16, 10), sky = [], lo = new THREE.Color('#c9c08a'), hi = new THREE.Color('#3f6f73');
    for (let i = 0; i < dome.attributes.position.count; i++) sky.push(...lo.clone().lerp(hi, Math.max(0, Math.min(1, dome.attributes.position.getY(i) / 260))).toArray());
    dome.setAttribute('color', new THREE.Float32BufferAttribute(sky, 3));
    scene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(26, 20), new THREE.MeshBasicMaterial({ color: '#f6ffd8', fog: false }));
    disc.position.set(-250, 120, -190); disc.lookAt(0, 0, 0); scene.add(disc);

    // The quarry: dry floor, then benches of the mine's own grey-green rock going up past where anyone can walk,
    // with the acid coming down them in streaks the way it does in the tunnels.
    const size = 2 * (GROUND.radius + 22), land = new THREE.PlaneGeometry(size, size, 120, 120); land.rotateX(-Math.PI / 2);
    const at = land.attributes.position, paint = [], c = new THREE.Color(), grass = new THREE.Color('#7f8a3a');
    for (let i = 0; i < at.count; i++) {
      const x = at.getX(i), z = at.getZ(i), h = heightAt(x, z); at.setY(i, h);
      if (Math.hypot(x, z) > GROUND.radius) c.set(Math.sin(Math.atan2(z, x) * 19) > 0.94 ? '#78ff3c' : Math.floor(h / 6) % 2 ? '#5d6650' : '#454c3b');
      else c.set('#a89a4a').lerp(grass, (Math.sin(x * 0.5) * Math.cos(z * 0.4) + 1) * 0.3);
      paint.push(c.r, c.g, c.b);
    }
    land.setAttribute('color', new THREE.Float32BufferAttribute(paint, 3)); land.computeVertexNormals();
    scene.add(new THREE.Mesh(land, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    const rock = new THREE.DodecahedronGeometry(1, 0), stone = flat('#6d675a');
    ROCKS.forEach((k, i) => { const m = new THREE.Mesh(rock, stone); m.scale.set(k.r, k.r * 0.8, k.r); m.position.set(k.x, heightAt(k.x, k.z) + k.r * 0.3, k.z); m.rotation.y = i * 1.7; scene.add(m); });

    // The picnic itself, in the middle: tables, the punch, and the banner. Scenery: you walk and shoot through it.
    const punch = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20), new THREE.MeshBasicMaterial({ color: '#7dff3a' }));
    punch.rotation.x = -Math.PI / 2; punch.position.y = 0.04; scene.add(punch);
    const wood = flat('#7a5a32');
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.4, table = new THREE.Group();
      for (const [w, h, d, x, y, z] of [[1.9, 0.07, 0.8, 0, 0.76, 0], [1.9, 0.06, 0.28, 0, 0.45, 0.72], [1.9, 0.06, 0.28, 0, 0.45, -0.72], [0.08, 0.76, 1.5, -0.7, 0.38, 0], [0.08, 0.76, 1.5, 0.7, 0.38, 0]]) table.add(mesh(new THREE.BoxGeometry(w, h, d), wood, x, y, z));
      table.position.set(Math.cos(a) * 4.7, 0, Math.sin(a) * 4.7); table.rotation.y = -a; scene.add(table);
    }
    const banner = board([['COMPANY PICNIC', 58], ['ATTENDANCE IS MANDATORY', 30]], 7, { bg: '#e9dfb0', fg: '#b3261a' });
    banner.position.set(0, 4.1, -7.5); scene.add(banner);
    for (const x of [-3.6, 3.6]) scene.add(mesh(new THREE.BoxGeometry(0.14, 5, 0.14), wood, x, 2.5, -7.5));
    const label = board([['PUNCH', 40]], 0.9, { bg: '#5a3a1c', fg: '#e9dfb0', px: 128, py: 48 });
    label.position.set(2.95, 0.75, 0.4); label.rotation.y = Math.PI / 2; scene.add(label);
    scene.add(mesh(new THREE.BoxGeometry(0.06, 0.75, 0.06), wood, 2.95, 0.37, 0.4));

    // What is lying about (the server says which are gone), the gun in your hand, tracers and dynamite going off.
    this.pickups = new Map(PICKUPS.map((p) => { const g = pickup(p.kind); g.position.set(p.x, heightAt(p.x, p.z), p.z); scene.add(g); return [p.id, g]; }));
    const gun = this.gun = new THREE.Group();
    this.barrel = mesh(new THREE.BoxGeometry(0.07, 0.1, 0.44), flat('#3a3d3a'));
    this.can = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.14), new THREE.MeshBasicMaterial({ color: COLOR.rivet }), 0, 0.075, 0.08);
    this.flash = mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff4b0', fog: false }), 0, 0, -0.26);
    gun.add(this.barrel, mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), flat('#2a1c14'), 0, -0.12, 0.14), this.can, this.flash);
    gun.position.set(0.2, -0.19, -0.5); gun.scale.setScalar(0.6); this.camera.add(gun);
    this.tracers = Array.from({ length: 12 }, () => {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#fff1a8', transparent: true, fog: false }));
      line.visible = false; line.frustumCulled = false; line.userData.life = 0; scene.add(line); return line;
    });
    this.blasts = Array.from({ length: 3 }, () => { const b = mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, fog: false })); b.visible = false; b.userData.life = 0; scene.add(b); return b; });
    this.tracerAt = 0; this.blastAt = 0;

    this.miners = new OtherMiners(scene, { reduceMotion, tile: 1, ground: heightAt });
    this.pos = new THREE.Vector2(0, 0); this.yaw = 0; this.pitch = 0; this.air = 0; this.vy = 0; this.bob = 0; this.kick = 0; this.zoom = 0;
    this.input = { f: 0, s: 0, t: 0 }; this.jumping = false; this.firing = false; this.trigger = false;
    this.hp = 0; this.hat = 0; this.dead = true; // nobody walks or shoots until the server says where you are
    this.held = 'rivet'; this.carry = null;      // the gun in your hand, and the extra one you picked up ({ kind, ammo }) if any
    this.shots = []; this.nextShot = 0;
    this.resize();
    this.loop = this.loop.bind(this); this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }
  resize() {
    const c = this.renderer.domElement, w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(Math.max(160, Math.round(w * this.scale)), Math.max(100, Math.round(h * this.scale)), false);
    this.camera.aspect = w / h;
    this.fov = Math.min(105, Math.max(72, (2 * Math.atan(Math.tan((76 * Math.PI) / 360) / this.camera.aspect) * 180) / Math.PI)); // as the mine: wide enough on a tall phone
    this.camera.updateProjectionMatrix();
  }
  look(dyaw, dpitch) { const k = 1 - SCOPE * this.zoom; this.yaw += dyaw * k; this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + dpitch * k)); }
  /** Put `kind` in your hand (only the rivet gun or the one you carry), and make the gun on screen look like it. */
  hold(kind) {
    this.held = kind && kind === this.carry?.kind ? kind : 'rivet';
    this.barrel.scale.z = BARREL[this.held]; this.flash.position.z = -0.22 * BARREL[this.held] - 0.04; this.can.material.color.set(COLOR[this.held]);
  }
  swap() { this.hold(this.held === 'rivet' ? this.carry?.kind : 'rivet'); }
  tracer(from, to) {
    const line = this.tracers[this.tracerAt++ % this.tracers.length], p = line.geometry.attributes.position;
    p.setXYZ(0, from.x, from.y, from.z); p.setXYZ(1, to.x, to.y, to.z); p.needsUpdate = true;
    line.userData.life = TRACER_S; line.visible = true;
  }
  boom(at) { const b = this.blasts[this.blastAt++ % this.blasts.length]; b.position.set(at.x, at.y, at.z); b.userData.life = BLAST_S; b.visible = true; }
  /** The server's latest word: where you stand (when it says so), your hat, health and gun, what is gone, and everyone else. */
  apply(view) {
    const you = view.you;
    if (view.snap) {
      this.pos.set(view.snap.x, view.snap.z); this.air = this.vy = 0;
      if (this.dead) { this.yaw = Math.atan2(view.snap.x, view.snap.z); this.pitch = 0; } // just arrived or just back: face the picnic, not the wall
    }
    if (you.hp < this.hp) this.onEvent?.('hurt'); else if (you.hat < this.hat) this.onEvent?.('dent');
    this.hp = you.hp; this.hat = you.hat; this.dead = this.hp <= 0;
    this.carry = you.gun; this.hold(view.got && view.got === you.gun?.kind ? view.got : this.held); // a gun you just walked over goes straight into your hand
    for (const [id, g] of this.pickups) g.visible = !view.gone.includes(id);
    this.miners.set(view.others.map((o) => ({ ...o, y: o.z })));
    for (const o of view.others) {
      const m = this.miners.map.get(o.id);
      if (!m.gun) {
        m.gun = mesh(new THREE.BoxGeometry(0.06, 0.08, 0.4), flat('#3a3d3a'), 0.26, 1.02, 0.24); m.spare = m.hat[0].clone(); m.spare.position.y += 0.13;
        m.group.add(m.gun); m.head.add(m.spare); m.shots = o.shot.n;
      }
      m.air = o.air; m.dead = o.dead; m.safe = o.safe;
      for (const part of m.hat) part.visible = o.hats > 0; // shot off: bare-headed until it grows back
      m.spare.visible = o.hats > 1;
      if (o.shot.n !== m.shots) { // they fired since we last heard: draw it
        m.shots = o.shot.n; this.onEvent?.('shot-far', o.shot.gun);
        this.tracer({ x: m.x, y: heightAt(m.x, m.z) + o.air + 1.1, z: m.z }, o.shot);
        if (GUNS[o.shot.gun]?.blast) this.boom(o.shot);
      }
    }
  }
  /** What the heartbeat tells the server: where you are, and the shots fired since the last one. */
  report() { const shots = this.shots; this.shots = []; return { x: this.pos.x, z: this.pos.y, yaw: this.yaw, air: this.air, shots }; }
  fire(now) {
    if (this.dead || now < this.nextShot) return;
    const kind = this.held, gun = GUNS[kind];
    this.nextShot = now + gun.everyMs; this.kick = 1;
    const cp = Math.cos(this.pitch), dir = { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
    const standing = [...this.miners.map].filter(([, m]) => !m.dead && !m.safe).map(([id, m]) => ({ id, x: m.x, y: m.group.position.y, z: m.z }));
    const hit = shoot(this.camera.position, dir, standing);
    this.shots = [...this.shots, { x: hit.x, y: hit.y, z: hit.z, hit: hit.id, gun: kind }].slice(-4);
    this.tracer(this.flash.getWorldPosition(new THREE.Vector3()), hit);
    if (gun.blast) this.boom(hit);
    if (kind !== 'rivet' && --this.carry.ammo <= 0) { this.carry = null; this.hold('rivet'); } // the server counts too; this just keeps the hand honest between reports
    this.onEvent?.(hit.id ? 'hit' : 'shot', kind);
  }
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const { f, s, t } = this.input, ground = heightAt(this.pos.x, this.pos.y);
    this.yaw -= t * TURN * dt * (1 - SCOPE * this.zoom);
    if (this.dead) { // on your back, looking at the sky
      this.camera.position.set(this.pos.x, ground + 0.3, this.pos.y); this.camera.rotation.set(0.5, this.yaw, 1.2, 'YXZ');
    } else {
      if (f || s) {
        const step = GROUND.speed * dt * (f && s ? 0.75 : 1), sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        const p = walk(this.pos.x + (-sin * f + cos * s) * step, this.pos.y + (-cos * f - sin * s) * step);
        this.pos.set(p.x, p.z); if (!this.air) this.bob += dt * 11;
      }
      if (this.jumping && !this.air) this.vy = 6.5;
      if (this.air || this.vy) { this.vy -= 9 * dt; this.air = Math.max(0, this.air + this.vy * dt); if (!this.air) this.vy = 0; } // a long, slow jump: over two metres up
      this.camera.position.set(this.pos.x, heightAt(this.pos.x, this.pos.y) + this.air + GROUND.eye + (this.reduce ? 0 : Math.sin(this.bob) * 0.04), this.pos.y);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      this.camera.updateMatrixWorld();
      if (this.firing || this.trigger) this.fire(now);
    }
    // The surveyor is a telescope with a trigger: stand still with it and the view closes in; move and it lets go.
    const scoped = this.held === 'surveyor' && !this.dead && !f && !s && !this.air ? 1 : 0;
    this.zoom = this.reduce ? scoped : this.zoom + (scoped - this.zoom) * Math.min(1, dt * 7);
    const fov = this.fov * (1 - SCOPE * this.zoom);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.kick = Math.max(0, this.kick - dt * 9);
    this.gun.visible = !this.dead; this.gun.position.z = -0.5 + this.kick * 0.06; this.gun.rotation.x = this.kick * 0.12; this.flash.visible = this.kick > 0.55;
    this.miners.update(dt, now, this.yaw);
    for (const m of this.miners.map.values()) {
      m.group.position.y += m.dead ? 0.2 : m.air || 0;
      m.group.rotation.x = m.dead ? -Math.PI / 2 : 0; // flat on the grass until they are back
      m.group.visible = !m.safe || this.reduce || Math.floor(now / 120) % 2 === 0; // just back up: blinking, and nobody can hit them
      const far = Math.max(1, Math.hypot(m.x - this.pos.x, m.z - this.pos.y) / 9); // keep the name readable across the quarry
      m.tag?.scale.set(1.2 * far, 0.3 * far, 1); m.tag?.position.setY(2.08 + 0.15 * (far - 1));
    }
    if (!this.reduce) for (const g of this.pickups.values()) if (g.userData.turns) g.userData.turns.rotation.y = now / 600;
    for (const line of this.tracers) {
      if (!line.visible) continue;
      line.userData.life -= dt; line.material.opacity = Math.max(0, line.userData.life / TRACER_S); line.visible = line.userData.life > 0;
    }
    for (const b of this.blasts) {
      if (!b.visible) continue;
      b.userData.life -= dt; const k = Math.max(0, b.userData.life / BLAST_S);
      b.scale.setScalar(1 + (1 - k) * (GUNS.dynamite.blast - 1)); b.material.opacity = k; b.visible = k > 0;
    }
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.miners.dispose();
    this.scene.traverse((o) => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); } });
    this.renderer.dispose();
  }
}
