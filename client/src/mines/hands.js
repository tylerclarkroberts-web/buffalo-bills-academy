import * as THREE from 'three';

/**
 * The first-person pickaxe: no hands, just the tool poking in from the lower right with its grip off screen.
 * It has its own scene so it shares the mine's pixelated renderer but never disappears inside a wall.
 */
export function buildMineHands() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.01, 5);
  const group = new THREE.Group(); scene.add(group);
  scene.add(new THREE.AmbientLight('#d8dfc4', 1.5));
  const lamp = new THREE.DirectionalLight('#fff1cc', 2.2); lamp.position.set(-1, 2, 3); scene.add(lamp);
  const material = color => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const wood = material('#a4774a'), iron = material('#515c60'), steel = material('#859397');
  const barrel = new THREE.CylinderGeometry(1, 1, 1, 8);
  const part = (geo, mat, x, y, z, w, h, d) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); pickaxe.add(mesh); return mesh;
  };
  // `grip` is where a hand would be: the swing pivots there, and it sits just below the screen.
  const grip = new THREE.Group(); grip.name = 'mine-grip'; group.add(grip);
  const pickaxe = new THREE.Group(); pickaxe.name = 'mine-pickaxe'; grip.add(pickaxe);
  pickaxe.rotation.y = -.86;
  part(barrel, wood, 0, .23, 0, .038, .84, .03);
  part(barrel, iron, 0, .594, 0, .054, .094, .048);
  // A diamond section narrows to the pick point and flattens out at the chisel edge.
  const sections = [
    [-.44, .385, .003, .003], [-.34, .504, .018, .018], [-.18, .587, .034, .033],
    [0, .61, .044, .042], [.14, .584, .034, .032], [.28, .514, .008, .056],
  ];
  const vertices = [], indices = [];
  for (const [x, y, height, width] of sections) {
    const i = vertices.length / 3;
    vertices.push(x, y + height, 0, x, y, width, x, y - height, 0, x, y, -width);
    if (i) for (let j = 0; j < 4; j++) {
      const next = (j + 1) % 4;
      indices.push(i - 4 + j, i - 4 + next, i + next, i - 4 + j, i + next, i + j);
    }
  }
  const end = vertices.length / 3 - 4;
  indices.push(0, 2, 1, 0, 3, 2, end, end + 1, end + 2, end, end + 2, end + 3);
  const head = new THREE.BufferGeometry();
  head.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  head.setIndex(indices); head.computeVertexNormals();
  const blade = new THREE.Mesh(head, steel); blade.name = 'pick-head'; pickaxe.add(blade);
  // Drawn small then stretched over the view, so the pick's pixels are chunkier than the tunnel's.
  const target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const blit = new THREE.Scene();
  blit.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, depthTest: false, depthWrite: false })));
  const hands = { scene, camera, group, grip, pickaxe, target, blit, blitCamera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), walk: 0, walking: 0, mining: 0 };
  resizeMineHands(hands, 1);
  return hands;
}

const PIXEL = 2; // pick pixels per tunnel pixel

/** Draws the pick over whatever is already on the canvas. */
export function drawMineHands(hands, renderer) {
  const size = renderer.getSize(new THREE.Vector2()), color = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  const w = Math.max(1, Math.round(size.x / PIXEL)), h = Math.max(1, Math.round(size.y / PIXEL));
  if (hands.target.width !== w || hands.target.height !== h) hands.target.setSize(w, h);
  renderer.setRenderTarget(hands.target); renderer.setClearColor(0, 0); renderer.clear();
  renderer.render(hands.scene, hands.camera);
  renderer.setRenderTarget(null); renderer.setClearColor(color, alpha);
  const auto = renderer.autoClear; renderer.autoClear = false;
  renderer.render(hands.blit, hands.blitCamera); renderer.autoClear = auto;
}

export function resizeMineHands(hands, aspect) {
  hands.camera.aspect = aspect; hands.camera.updateProjectionMatrix();
  const halfHeight = Math.tan(25 * Math.PI / 180);
  hands.spread = halfHeight * aspect * (aspect < 1 ? .62 : .72);
  hands.height = -halfHeight * 1.12;
  hands.grip.scale.setScalar(.95 * Math.min(1, Math.sqrt(aspect / 1.1)));
  stepMineHands(hands, 0);
}

export function stepMineHands(hands, dt, { distance = 0, mining = false, hidden = false, reduce = false } = {}) {
  hands.group.visible = !hidden;
  hands.walk += distance * 4.5;
  hands.walking += ((distance > .0001 && !hidden && !reduce ? 1 : 0) - hands.walking) * (1 - Math.exp(-dt * 12));
  hands.mining = mining && !hidden && !reduce ? hands.mining + dt : 0;
  const sway = reduce || hidden ? 0 : Math.sin(hands.walk) * hands.walking;
  const lift = reduce || hidden ? 0 : Math.abs(Math.cos(hands.walk)) * hands.walking;
  const strike = hands.mining ? (1 - Math.cos(hands.mining * Math.PI * 4)) / 2 : 0;
  hands.grip.position.set(hands.spread * (1 - strike * .25) - sway * .012, hands.height - lift * .015, -1 - sway * .025 - strike * .14);
  hands.grip.rotation.set(-.1 - strike * .99, 0, .45 + sway * .035 + strike * .1);
}
