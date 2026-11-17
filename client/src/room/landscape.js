import * as THREE from 'three';
import { desertHorizon } from './desert-horizon.js';
import { ROOM_FLOOR_SCALE } from '../../../server/catalog/room.js';

const EARTH = -0.13;
const color = hex => new THREE.Color(hex);

/** All positions use the bunkhouse floor plan. Only the soil receives shadows, keeping the canyon out of the house shadow map. */
export function homesteadLandscape() {
  const group = new THREE.Group();
  group.name = 'homestead-landscape';
  group.scale.set(ROOM_FLOOR_SCALE, 1, ROOM_FLOOR_SCALE);
  let seed = 43536;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  const soil = new THREE.PlaneGeometry(78, 78, 26, 26);
  soil.rotateX(-Math.PI / 2);
  const soilColors = [], near = color('#a99676'), far = color('#c29e80');
  const points = soil.getAttribute('position');
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), z = points.getZ(i);
    const dust = 0.07 * (Math.cos(x * 0.6 + z * 0.26) + Math.sin(x * 0.32 - z));
    near.clone().lerp(far, Math.min(1, Math.hypot(x - 2, z - 1) / 24) + dust).toArray(soilColors, i * 3);
  }
  soil.setAttribute('color', new THREE.Float32BufferAttribute(soilColors, 3));
  const grain = new Uint8Array(128 * 128 * 4);
  for (let i = 0; i < grain.length; i += 4) {
    const dust = 244 + random() * 11;
    grain.set([dust, dust, dust, 255], i);
  }
  for (let i = 0; i < 290; i++) {
    const x = Math.floor(random() * 128), z = Math.floor(random() * 128), span = 1 + random() * 4, shade = 224 + random() * 22;
    for (let j = 0; j < span; j++) grain.set([shade, shade, shade, 255], (z * 128 + (x + j) % 128) * 4);
  }
  const grit = new THREE.DataTexture(grain, 128, 128);
  grit.wrapS = grit.wrapT = THREE.RepeatWrapping; grit.repeat.set(19, 19);
  grit.colorSpace = THREE.SRGBColorSpace; grit.generateMipmaps = true;
  grit.magFilter = THREE.LinearFilter; grit.minFilter = THREE.LinearMipmapLinearFilter; grit.needsUpdate = true;
  const ground = new THREE.Mesh(soil, new THREE.MeshLambertMaterial({ vertexColors: true, map: grit }));
  ground.name = 'ranch-ground'; ground.position.y = EARTH; ground.receiveShadow = true;
  group.add(ground, desertHorizon(ground.material));

  const vertices = [], colors = [];
  const triangle = (a, b, c, tintA, tintB = tintA, tintC = tintA) => {
    vertices.push(...a, ...b, ...c);
    colors.push(tintA.r, tintA.g, tintA.b, tintB.r, tintB.g, tintB.b, tintC.r, tintC.g, tintC.b);
  };
  const quad = (a, b, c, d, left, right = left) => { triangle(a, b, c, left, left, right); triangle(a, c, d, left, right, right); };

  // A wheel track leaves the old pavers; the narrower footpath curls back from the porch.
  function trail(knots, width, wheelTracks) {
    const curve = new THREE.CatmullRomCurve3(knots.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const edge = color('#c29563'), worn = color('#cfa877'), rut = color('#c39767');
    let last;
    for (let i = 0; i <= 80; i++) {
      const t = i / 80, p = curve.getPoint(t), d = curve.getTangent(t);
      const radius = width * (1 - (wheelTracks ? .48 : .2) * t);
      const at = (k, y) => [p.x - k * radius * d.z, y, p.z + k * radius * d.x];
      const y = EARTH + (wheelTracks ? .023 : .013);
      const row = [-1 - random() * .25, -.64, .67, 1 + random() * .25, -.54, -.41, .27, .40].map(k => at(k, y));
      if (last) {
        quad(last[0], row[0], row[1], last[1], edge, worn);
        quad(last[1], row[1], row[2], last[2], worn);
        quad(last[2], row[2], row[3], last[3], worn, edge);
        if (wheelTracks) for (const j of [4, 6]) if ((i + j * 3) % 22 < 11) {
          const lift = v => [v[0], v[1] + .003, v[2]];
          quad(lift(last[j]), lift(row[j]), lift(row[j+1]), lift(last[j+1]), rut);
        }
      }
      last = row;
    }
  }
  trail([[8.3,1.65],[9.45,1.6],[10.55,0.35],[10.6,-1.2],[9.55,-3.65],[9.4,-5.15],[11,-6.9],[13.4,-7.5],[14.4,-9.3],[13,-12.25],[14.4,-16.5]], 0.48, true);
  trail([[6.25,4.73],[6.4,5.6],[7.5,6.12],[8.8,5.94],[9.75,4.77],[9.86,3.38],[9.5,2.1],[9.4,1.6]], 0.22, false);

  // A soft apron under cut vertical cliffs, pale sediment seams, and a resistant cap.
  const strata = [[0,1.05,0.8],[0.16,0.88,0.96],[0.25,0.70,0.78],[0.53,0.66,0.96],[0.57,0.65,1.2],[0.78,0.62,0.91],[0.82,0.67,0.78],[0.96,0.66,1.01],[1,0.61,1.16]];
  function mesa(x, z, wide, deep, height, paint) {
    const sides = 11, turn = random(), footprint = [];
    for (let i = 0; i < sides; i++) {
      const angle = turn + i * Math.PI * 2 / sides;
      const irregular = 0.86 + random() * 0.27;
      footprint.push([Math.cos(angle) * wide * irregular, Math.sin(angle) * deep * irregular, 0.965 + random() * 0.035]);
    }
    let last;
    for (const [rise, scale, value] of strata) {
      const rim = footprint.map(([dx, dz, relief]) => [x + dx * scale + rise * wide * 0.08, EARTH + rise * height * relief, z + dz * scale]);
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        if (last) {
          const light = 0.86 + 0.22 * Math.cos(turn + i * 2 * Math.PI / sides - 1.07);
          quad(last[i], last[j], rim[j], rim[i], paint.clone().multiplyScalar(value * light));
        }
        if (rise === 1) triangle(rim[i], rim[j], [x + wide * 0.08, EARTH + height, z], paint.clone().multiplyScalar(1.24));
      }
      last = rim;
    }
  }
  for (const [x,z,w,d,h,hex] of [
    [-6.8,-5.4,2.2,1.05,1.95,'#b67455'],[-8.95,-6.4,2.25,1.7,3.25,'#ab715a'],[-6.55,-7.55,1.03,1,4.75,'#b17b61'],
    [-5.55,-7.8,0.50,0.70,3.25,'#ab745b'],[1.0,-11.7,4.25,1.9,3.4,'#bc8f78'],[4.4,-12.3,1.3,1.1,5.4,'#b78c79'],
    [10.1,-9.85,2.65,1.85,2.25,'#b58061'],[14.6,-6.4,1.65,1.4,3.4,'#b47e61'],[15.8,-5.8,0.65,0.8,4.5,'#bd8666'],
    [-14.2,1.5,2.7,3.1,3.9,'#b18068'],[-15.1,5.5,2.1,1.2,3.0,'#bb8d71'],[-8.4,11.8,2.7,1.5,2.7,'#b78566'],
    [1.0,16.9,4.3,1.8,3.4,'#ba8d76'],[17.0,8.5,2.1,2.2,3.9,'#b4836a'],[-12,-18,5,2.8,6.1,'#ba9588'],
    [-3,-19,4,2.5,4.1,'#be9b89'],[10,-21,5,2.4,5.5,'#ba9688'],
  ]) mesa(x, z, w, d, h, color(hex));

  function pebble(x, z, r, paint) {
    const rim = [], y = EARTH + 0.007;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, scale = r * (0.81 + random() * 0.28);
      rim.push([x + Math.cos(a) * scale, y, z + Math.sin(a) * scale * 0.77]);
    }
    const tip = [x - r * 0.25, y + r * 0.72, z - r * 0.09];
    rim.forEach((p, i) => triangle(p, rim[(i + 1) % rim.length], tip, paint.clone().multiplyScalar(0.84 + 0.25 * Math.sin(i))));
  }
  function yucca(x, z, size, paint) {
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4, dx = Math.cos(a), dz = Math.sin(a), spread = size * (0.29 + 0.42 * random());
      const edge = size * 0.092, y = EARTH + 0.014, h = size * (0.53 + 0.65 * random());
      const left = [x - dz * edge, y, z + dx * edge], right = [x + dz * edge, y, z - dx * edge];
      const fold = [x + dx * spread * 0.38, y + h * 0.4, z + dz * spread * 0.38], tip = [x + dx * spread, y + h, z + dz * spread];
      triangle(left, fold, tip, paint); triangle(fold, right, tip, paint.clone().multiplyScalar(0.71));
    }
  }
  // Authored clumps leave space around the doors, the turning chair, both trails and the wagon.
  for (const [x, z, size] of [[-4.74,3.72,0.57],[-2.85,7.05,0.56],[1.5,7.4,0.44],[4.55,6.64,0.61],[8.55,7.15,0.55],
    [10.65,4.12,0.75],[8.9,-0.68,0.66],[8.3,-3.76,0.43],[5.85,-3.9,0.73],[2.23,-4.00,0.47],[-2.5,-3.85,0.56],
    [-5.35,-2.67,0.85],[-6.55,0.55,0.49],[-4.85,5.85,0.39],[-8.6,5.5,0.8],[4.2,9.45,0.65],[13.0,2.4,0.64],
    [4.8,-6.55,0.57],[11.7,-2.6,0.69],[3.1,-8.1,0.49],[-1.5,-6.3,0.71]]) {
    yucca(x, z, size, color(random() > 0.52 ? '#7d8962' : '#918f63'));
    const direction = random() * 2 * Math.PI, offset = size * (0.5 + random() * .55);
    if (random() > .25) yucca(x - Math.cos(direction) * offset, z + Math.sin(direction) * offset, size * .61, color('#928658'));
    if (random() > .22) pebble(x + Math.sin(direction) * offset, z - Math.cos(direction) * offset, size * .49, color('#ac8463'));
    if (random() > .6) pebble(x + size * .81, z - size * .28, size * .19, color('#c39b76'));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const country = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  country.name = 'red-rock-country';
  group.add(country);
  return group;
}
