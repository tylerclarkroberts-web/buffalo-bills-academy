// Deterministic, admin/dev-only preview of the Lord Howe Island stick insect and STEEZE
// in a lit mid-tunnel. Not a real shift: no clock-in, no fog lottery, no roaming camera.
import * as THREE from 'three';
import { buildStick, poseStick, STICK_TILE, STICK_WALL_H } from './stickMesh.js';
import { buildSteeze } from './steezeMesh.js';
import { movesFor, combatStats } from '../../../server/engine/bug-combat.js';

export const MINE_PREVIEW_PATH = '/admin/mine-preview';
export const MINE_PREVIEW_API = '/admin/mine-preview';
export const MINE_PREVIEW_LABEL = 'Preview: not a real shift';

export const SHOTS = [
  'stick-wall', 'stick-ceiling', 'stick-intro', 'stick-battle',
  'steeze-tunnel', 'steeze-battle', 'steeze-golf', 'steeze-chicken',
];

const TILE = STICK_TILE, WALL_H = STICK_WALL_H;

function brickTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#1a2414';
  x.fillRect(0, 0, 256, 256);
  const cols = ['#2a3a1c', '#243416', '#334422', '#1e2c14', '#2e3c20'];
  const bh = 28, bw = 64;
  for (let row = 0; row < 12; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < 6; col++) {
      const px = col * bw + off, py = row * bh;
      x.fillStyle = cols[(row * 5 + col + 7) % cols.length];
      x.fillRect(px + 2, py + 2, bw - 4, bh - 4);
      x.fillStyle = 'rgba(180,200,80,.06)';
      x.fillRect(px + 4, py + 3, bw - 10, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function dirtTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#2a2014';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const g = 30 + (i * 17) % 50;
    x.fillStyle = `rgb(${g + 20},${g + 10},${g - 8})`;
    x.fillRect((i * 47) % 256, (i * 31) % 256, 2 + (i % 3), 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 4);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function dustTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i++) {
    x.fillStyle = `rgba(220,200,140,${0.04 + (i % 7) * 0.015})`;
    x.beginPath();
    x.arc((i * 73) % 256, (i * 91) % 256, 0.6 + (i % 3) * 0.5, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

/** A straight, lamp-lit mid-tunnel: open aisle along +Z, brick walls, no Dead Man's fog. */
export function buildPreviewTunnel(scene) {
  const brick = brickTexture();
  const dirt = dirtTexture();
  const wallMat = new THREE.MeshBasicMaterial({ map: brick, color: 0xb8c888, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshBasicMaterial({ map: dirt, color: 0x9a8050, side: THREE.DoubleSide });
  const ceilMat = new THREE.MeshBasicMaterial({ map: brick, color: 0x889868, side: THREE.DoubleSide });
  const length = TILE * 8, width = TILE, y0 = 0;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, length), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.001, 0);
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(width, length), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, WALL_H, 0);
  scene.add(ceil);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, WALL_H), wallMat);
    wall.position.set(side * width / 2, WALL_H / 2, 0);
    // Face the aisle: +X wall looks toward -X, -X wall looks toward +X.
    wall.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(wall);
  }
  // Open ends, framed like a doorway into the dark.
  for (const end of [-1, 1]) {
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(width, WALL_H),
      new THREE.MeshPhongMaterial({ color: 0x080604 }),
    );
    frame.position.set(0, WALL_H / 2, end * length / 2);
    frame.rotation.y = end > 0 ? Math.PI : 0;
    scene.add(frame);
  }
  // Acid drips, like the live mine, so the corridor reads as the same place.
  const dripMat = new THREE.MeshBasicMaterial({ color: 0xb8ff40, transparent: true, opacity: 0.7 });
  for (let i = 0; i < 6; i++) {
    const z = -length / 2 + 1.2 + i * 2.3;
    const drip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.15, 0.05), dripMat);
    drip.position.set(((i % 2) ? 0.35 : -0.45), WALL_H - 0.55, z);
    scene.add(drip);
    const puddle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), dripMat);
    puddle.position.set(drip.position.x, WALL_H - 0.02, z);
    scene.add(puddle);
  }
  // Warm lamps along the run, decaying so edges fall off.
  const lamps = [];
  for (let i = 0; i < 5; i++) {
    const z = -3.6 + i * 1.8;
    const lamp = new THREE.PointLight(0xffc070, 1.55, 5.4, 1.35);
    lamp.position.set(0.05, WALL_H - 0.28, z);
    scene.add(lamp);
    const bulb = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.1, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xffe08a }),
    );
    bulb.position.copy(lamp.position);
    scene.add(bulb);
    lamps.push(lamp);
  }
  const ambient = new THREE.AmbientLight(0x3a3020, 0.32);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x88785a, 0x1a1208, 0.35);
  scene.add(hemi);
  // Airborne dust film in the lamp cones, not baked into any photo.
  const dust = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.92, WALL_H * 0.9),
    new THREE.MeshBasicMaterial({
      map: dustTexture(), transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  dust.position.set(0, WALL_H * 0.5, 0.2);
  scene.add(dust);
  return { length, width, lamps, ambient, dust, dispose() {
    [brick, dirt].forEach((tex) => tex.dispose());
  } };
}

function corridorGrid() {
  // One open cell with solid neighbours, so poseStick can pick a wall or the ceiling.
  const g = Array.from({ length: 5 }, () => Array(5).fill(1));
  g[2][2] = 0;
  return g;
}

function placeStick(scene, surface) {
  const built = buildStick();
  built.group.scale.set(1.25, 1.25, 1.25);
  if (built.fill) { built.fill.intensity = 4.2; built.fill.distance = 8; }
  built.group.traverse((o) => {
    if (o.isMesh && o.material && o.material.emissive) {
      o.material.emissive = new THREE.Color(0x3a2414);
      o.material.emissiveIntensity = 0.55;
    }
  });
  const heading = surface.kind === 'wall' ? Math.PI / 2 : 0;
  poseStick(built, {
    grid: corridorGrid(),
    x: 0, z: 0, heading, now: 800,
    reduce: true, tile: TILE, wallH: WALL_H,
    surface,
  });
  // Preview is a single cell at the origin; pin the insect on the visible face.
  if (surface.kind === 'wall') {
    built.group.position.set((TILE * 0.5 - 0.28) * (surface.nx || 1), 1.1, 0);
  } else if (surface.kind === 'ceiling') {
    built.group.position.set(0, WALL_H - 0.28, 0);
  }
  scene.add(built.group);
  return built;
}

function placeSteeze(scene) {
  const built = buildSteeze();
  built.group.position.set(0, 0, 0);
  // Face the camera standing in +Z.
  built.group.rotation.y = 0;
  scene.add(built.group);
  // A key lamp just off his shoulder so the contact shadow and warm grade read.
  const key = new THREE.PointLight(0xffd090, 1.8, 4.2, 1.2);
  key.position.set(0.55, 1.7, 1.15);
  scene.add(key);
  return built;
}

function frameCamera(camera, shot, target) {
  if (shot === 'stick-wall' || shot === 'stick-intro') {
    camera.position.set(-0.15, 1.25, 2.35);
    camera.lookAt(target.x, 1.05, 0.1);
  } else if (shot === 'stick-ceiling') {
    camera.position.set(0.1, 1.05, 1.85);
    camera.lookAt(0, WALL_H - 0.15, 0);
  } else {
    // STEEZE mid-tunnel: stand a couple of metres in front, eye height.
    camera.position.set(0.18, 1.32, 2.55);
    camera.lookAt(0, 0.95, 0);
  }
  camera.updateMatrixWorld();
}

/**
 * Mount the lit-tunnel preview into `canvas`. Resolves when the first frame (and STEEZE
 * photo, if used) has been drawn. Returns a disposer.
 */
export function mountMinePreview(canvas, { shot = 'stick-wall', onReady } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x1a2210, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0c1008, 6, 16);
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.08, 40);
  const tunnel = buildPreviewTunnel(scene);
  const isStick = shot.startsWith('stick');
  const built = isStick
    ? placeStick(scene, shot === 'stick-ceiling' ? { kind: 'ceiling' } : { kind: 'wall', nx: 1, nz: 0 })
    : placeSteeze(scene);
  const subject = built.group.position.clone();
  const key = new THREE.PointLight(0xffe2a0, 3.2, 8, 1.1);
  key.position.copy(subject).add(new THREE.Vector3(-0.8, 0.6, 1.6));
  scene.add(key);
  const target = subject;
  const resize = () => {
    const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1280);
    const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 800);
    renderer.setSize(w, h, true);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    frameCamera(camera, shot, target);
    renderer.render(scene, camera);
  };
  resize();
  window.addEventListener('resize', resize);
  let ready = false;
  const finish = () => {
    if (ready) return;
    ready = true;
    frameCamera(camera, shot, target);
    renderer.render(scene, camera);
    onReady?.();
  };
  // STEEZE photo is async; wait for the map to swap, with a timeout so a missing PNG still previews.
  if (!isStick && built.mesh?.material) {
    const mat = built.mesh.material;
    const started = performance.now();
    const tick = () => {
      frameCamera(camera, shot, target);
      renderer.render(scene, camera);
      const loaded = mat.map && mat.map.image && (mat.map.image.naturalWidth || mat.map.image.width) > 64;
      if (loaded || performance.now() - started > 2500) finish();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } else {
    requestAnimationFrame(() => { resize(); finish(); });
  }
  let raf = 0;
  const loop = () => {
    frameCamera(camera, shot, target);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    built.dispose?.();
    tunnel.dispose?.();
    renderer.dispose();
  };
}

export function previewBout(kind) {
  const you = {
    species: 'lamprima', name: 'Lamprima', level: 8, mood: 80, gear: 0,
    battle: { stance: 'balanced', specials: ['technique', 'signature'] },
  };
  const them = kind === 'steeze'
    ? { species: 'steeze', name: 'STEEZE', level: 5, mood: 80, gear: 0, battle: { stance: 'balanced', specials: ['technique', 'signature', 'tactic', 'capstone'] } }
    : { species: 'dryococelus', name: 'Lord Howe Island Stick Insect', level: 30, mood: 80, gear: 0, battle: { stance: 'balanced', specials: ['technique', 'signature', 'tactic', 'capstone'] } };
  const ys = combatStats(you.level), ts = combatStats(them.level);
  return {
    id: `preview:${kind}`,
    live: true,
    preview: true,
    you, them,
    maxHp: [ys.maxHp, ts.maxHp],
    line: kind === 'steeze' ? 0.72 : 0.18,
    rounds: [],
    moves: movesFor(you.species, you.level, 3),
    next: 'basic',
    queue: [],
    jar: kind === 'steeze' ? { chance: 0.9 } : { chance: 0.01 },
  };
}

export function flourishOf(shot) {
  if (shot === 'steeze-golf') return 'golf';
  if (shot === 'steeze-chicken') return 'chicken';
  return null;
}
