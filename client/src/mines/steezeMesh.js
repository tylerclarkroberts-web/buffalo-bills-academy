// STEEZE in the tunnels: the private photo as a standing billboard, feet on the floor,
// a contact shadow, and a warm lamp tint so he reads as actually down in the mine.
// The PNG itself is not restyled. If /api/steeze.png is missing, a quiet placeholder stands in.
import * as THREE from 'three';

const HEIGHT = 1.68;
const ASPECT = 803 / 1676;

function placeholderTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 512);
  x.fillStyle = 'rgba(20,14,8,.85)';
  x.beginPath(); x.ellipse(128, 500, 70, 14, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#3a2a18';
  x.fillRect(88, 160, 80, 220);
  x.beginPath(); x.arc(128, 120, 44, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#c9a050';
  x.font = 'bold 28px sans-serif'; x.textAlign = 'center';
  x.fillText('STEEZE', 128, 430);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}


/** Warm grade, edge falloff and a light dust film on a copy of the photo. The source PNG is not rewritten. */
function gradeSteezeTexture(tex) {
  const img = tex.image;
  if (!img || !(img.naturalWidth || img.width)) return tex;
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, w, h);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = 'rgba(40, 24, 10, 0.16)';
  x.fillRect(0, 0, w, h);
  const lamp = x.createRadialGradient(w * 0.46, h * 0.22, w * 0.08, w * 0.5, h * 0.55, Math.max(w, h) * 0.72);
  lamp.addColorStop(0, 'rgba(255, 220, 150, 0.16)');
  lamp.addColorStop(0.4, 'rgba(180, 120, 60, 0.08)');
  lamp.addColorStop(1, 'rgba(8, 4, 0, 0.42)');
  x.fillStyle = lamp;
  x.fillRect(0, 0, w, h);
  const id = x.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 16) {
    if (d[i + 3] < 8) continue;
    const n = ((i * 13) % 9) - 4;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n - 1));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n - 2));
  }
  x.putImageData(id, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.colorSpace = THREE.SRGBColorSpace;
  out.minFilter = THREE.LinearFilter;
  out.magFilter = THREE.LinearFilter;
  return out;
}

export function buildSteeze() {
  const group = new THREE.Group();
  const w = HEIGHT * ASPECT, h = HEIGHT;
  const mat = new THREE.MeshBasicMaterial({
    map: placeholderTexture(),
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
    // Warm, slightly dim multiply so the photo picks up lamp light instead of studio white.
    color: new THREE.Color(0xc9a070),
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.y = h / 2;
  mesh.renderOrder = 6;
  group.add(mesh);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(w * 0.42, 28),
    new THREE.MeshBasicMaterial({ color: 0x020100, transparent: true, opacity: 0.62, depthWrite: false, fog: false }),
  );
  shadow.renderOrder = 5;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.04, 0.016, 0.06);
  shadow.scale.set(1.15, 0.58, 1);
  group.add(shadow);

  const fill = new THREE.PointLight(0xffc070, 0.42, 2.8);
  fill.position.set(0.22, h * 0.62, 0.4);
  group.add(fill);
  const rim = new THREE.PointLight(0xffe6c0, 0.28, 2.2);
  rim.position.set(-0.25, h * 0.85, -0.35);
  group.add(rim);

  const loader = new THREE.TextureLoader();
  loader.load('/api/steeze.png', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const graded = gradeSteezeTexture(tex);
    const old = mat.map;
    mat.map = graded;
    mat.needsUpdate = true;
    tex.dispose();
    old?.dispose?.();
  }, undefined, () => { /* 404: keep the placeholder */ });

  return {
    group, mesh, shadow,
    dispose() {
      mat.map?.dispose?.();
      mat.dispose();
      mesh.geometry.dispose();
      shadow.geometry.dispose();
      shadow.material.dispose();
    },
  };
}
