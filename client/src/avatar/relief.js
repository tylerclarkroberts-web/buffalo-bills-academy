// A tiny three.js scene that shows the low-poly face as a real faceted 3D relief, turning gently.
import * as THREE from 'three';

export function mountRelief(canvas, { tris, width, height }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 0, 4.2);
  const n = tris.length / 10;
  const pos = new Float32Array(n * 9), col = new Float32Array(n * 9);
  const sx = 2 / height;
  const depth = (x, y) => {
    const nx = (x - width / 2) / (width * 0.43), ny = (y - height * 0.47) / (height * 0.46);
    const r = Math.min(1, nx * nx + ny * ny);
    let z = Math.sqrt(1 - r) * 0.55;
    const nose = Math.exp(-(((x - width / 2) / (width * 0.07)) ** 2 + ((y - height * 0.56) / (height * 0.1)) ** 2));
    return z + nose * 0.12;
  };
  for (let i = 0; i < n; i++) {
    for (let v = 0; v < 3; v++) {
      const x = tris[i * 10 + v * 2], y = tris[i * 10 + v * 2 + 1];
      pos[i * 9 + v * 3] = (x - width / 2) * sx; pos[i * 9 + v * 3 + 1] = -(y - height / 2) * sx; pos[i * 9 + v * 3 + 2] = depth(x, y);
      col[i * 9 + v * 3] = tris[i * 10 + 6] / 255; col[i * 9 + v * 3 + 1] = tris[i * 10 + 7] / 255; col[i * 9 + v * 3 + 2] = tris[i * 10 + 8] / 255;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0, side: THREE.DoubleSide }));
  scene.add(mesh);
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const key = new THREE.DirectionalLight(0xffd2b0, 1.6); key.position.set(-2, 2, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x3fe0d0, 1.2); rim.position.set(3, 0.5, -1); scene.add(rim);
  const pink = new THREE.PointLight(0xff4f7b, 6, 8); pink.position.set(2.2, -1.2, 2); scene.add(pink);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let raf = 0; const t0 = performance.now();
  const size = () => { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  size();
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    mesh.rotation.y = reduce ? 0.25 : Math.sin(t * 0.7) * 0.45;
    mesh.rotation.x = reduce ? 0 : Math.sin(t * 0.9) * 0.06;
    renderer.render(scene, cam);
    raf = requestAnimationFrame(loop);
  };
  loop();
  const ro = new ResizeObserver(size); ro.observe(canvas);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); geo.dispose(); renderer.dispose(); };
}
