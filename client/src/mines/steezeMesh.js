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
    color: new THREE.Color(0xe2c49a),
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.y = h / 2;
  mesh.renderOrder = 6;
  group.add(mesh);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(w * 0.32, 28),
    new THREE.MeshBasicMaterial({ color: 0x050200, transparent: true, opacity: 0.48, depthWrite: false, fog: false }),
  );
  shadow.renderOrder = 5;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.02, 0.014, 0.04);
  shadow.scale.set(1.05, 0.52, 1);
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
    const old = mat.map;
    mat.map = tex;
    mat.needsUpdate = true;
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
