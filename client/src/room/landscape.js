import * as THREE from 'three';
import { desertHorizon } from './desert-horizon.js';
import { ROOM_FLOOR_SCALE } from '../../../server/catalog/room.js';
import { ROOM_GRADE } from './scene-model.js';

const EARTH = -0.13;
const color = hex => new THREE.Color(hex);
const smooth = THREE.MathUtils.smoothstep;
function yardEdge(x, z) {
  const waviness = .13 * Math.cos(2.6 * x + z * 1.5) + .10 * Math.sin(x * .6 - 3.3 * z);
  return Math.min(x - 1.6, 9.58 - .021 * (z - 1.2) ** 2 - x,
    z + 7.65 - .055 * (x - 3.9) ** 2, 8.0 - .057 * (x - 4.7) ** 2 - z) + waviness;
}
// The lawn is a low rise in the desert, level under the wagon's wheels. The verge slopes down to the fence and the footpath beyond it.
const turfLevel = (x, z) => EARTH + 0.119 * smooth(yardEdge(x, z), -.42, .62) * (1 - smooth(x, 8.34, 8.62));
/** How high the ground lies at a floor-plan point, for whatever stands on it outside this group. */
export const groundLevel = (x, z) => ROOM_GRADE + turfLevel(x, z);

/** All positions use the bunkhouse floor plan. Only the soil receives shadows, keeping the canyon out of the house shadow map. */
export function homesteadLandscape() {
  const group = new THREE.Group();
  group.name = 'homestead-landscape';
  group.scale.set(ROOM_FLOOR_SCALE, 1, ROOM_FLOOR_SCALE); group.position.y = ROOM_GRADE;
  let seed = 43536;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  const soil = new THREE.PlaneGeometry(78, 78, 72, 72);
  soil.rotateX(-Math.PI / 2);
  const soilColors = [], near = color('#a99676'), far = color('#c29e80');
  const sage = color('#708761'), hay = color('#a59a72'), patch = new THREE.Color(), shade = new THREE.Color();
  // Spend the ground mesh's vertices on the lawn; the far desert only needs a few large quads.
  const axis = value => Math.sign(value) * (Math.abs(value) < 32 ? Math.abs(value) * 0.35 : 11.2 + (Math.abs(value) - 32) * 27.8 / 7);
  const points = soil.getAttribute('position'), uv = soil.getAttribute('uv');
  for (let i = 0; i < points.count; i++) {
    const x = axis(points.getX(i)), z = axis(points.getZ(i));
    const dust = 0.07 * (Math.cos(x * 0.6 + z * 0.26) + Math.sin(x * 0.32 - z));
    shade.copy(near).lerp(far, Math.min(1, Math.hypot(x - 2, z - 1) / 24) + dust);
    const green = smooth(yardEdge(x, z), -.21, .75);
    const mottling = .08 * Math.sin(2.4 * x + 1.3 * z) + .07 * Math.sin(1.65 * z - x * .36);
    const dry = .16 + .43 * (1 - smooth(z, -5, 1)) + .15 * smooth(x, 6.5, 9.6) + mottling;
    patch.copy(sage).lerp(hay, dry);
    // The lawn wears away from the foot of the porch steps to the gate, and beside the stock trough.
    const footpath = smooth(x, 6.45, 6.85) * (1 - smooth(Math.abs(z - 2.83), .37, .77));
    const trough = (1 - smooth(Math.hypot((x - 6.9) * .65, z + 4.50), .46, 1.36)) * .54;
    shade.lerp(patch, green * (1 - Math.max(footpath, trough))).toArray(soilColors, i * 3);
    points.setXYZ(i, x, turfLevel(x, z) - EARTH, z);
    uv.setXY(i, .5 + x / 78, .5 - z / 78);
  }
  soil.computeVertexNormals();
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

  // A short footpath joins the yard gate to the winding wagon road.
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
  trail([[15.1,10.9],[13.5,7.4],[11.5,5.8],[10.6,3.6],[10.8,2.0],[11.65,0],[11.25,-1.8],[9.55,-3.65],[9.4,-5.15],[11,-6.9],[13.4,-7.5],[14.4,-9.3],[13,-12.25],[14.4,-16.5]], 0.46, true);
  trail([[8.70,2.83],[9.17,2.83],[9.85,2.85],[10.7,2.83]], 0.40, false);

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
    [-8.7,-5.8,2.2,1.05,1.95,'#b67455'],[-10.6,-6.9,2.25,1.7,3.25,'#ab715a'],[-9.75,-8.35,1.03,1,4.75,'#b17b61'],
    [-8.65,-8.4,0.50,0.70,3.25,'#ab745b'],[1.0,-13.2,4.25,1.9,3.4,'#bc8f78'],[4.4,-13.45,1.3,1.1,5.4,'#b78c79'],
    [10.1,-9.85,2.65,1.85,2.25,'#b58061'],[14.6,-6.4,1.65,1.4,3.4,'#b47e61'],[15.8,-5.8,0.65,0.8,4.5,'#bd8666'],
    [-14.2,1.5,2.7,3.1,3.9,'#b18068'],[-15.1,5.5,2.1,1.2,3.0,'#bb8d71'],[-8.4,11.8,2.7,1.5,2.7,'#b78566'],
    [1.0,16.9,4.3,1.8,3.4,'#ba8d76'],[17.0,8.5,2.1,2.2,3.9,'#b4836a'],[-12,-18,5,2.8,6.1,'#ba9588'],
    [-3,-19,4,2.5,4.1,'#be9b89'],[10,-21,5,2.4,5.5,'#ba9688'],
  ]) mesa(x, z, w, d, h, color(hex));

  function pebble(x, z, r, paint) {
    const rim = [], y = turfLevel(x, z) + 0.007;
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
      const edge = size * 0.092, y = turfLevel(x, z) + 0.014, h = size * (0.53 + 0.65 * random());
      const left = [x - dz * edge, y, z + dx * edge], right = [x + dz * edge, y, z - dx * edge];
      const fold = [x + dx * spread * 0.38, y + h * 0.4, z + dz * spread * 0.38], tip = [x + dx * spread, y + h, z + dz * spread];
      triangle(left, fold, tip, paint); triangle(fold, right, tip, paint.clone().multiplyScalar(0.71));
    }
  }
  // Authored clumps leave space around the doors, the porch, the fence line, both trails and the wagon.
  for (const [x, z, size] of [[-5.15,3.72,0.57],[-2.85,8.14,0.56],[1.5,8.21,0.44],[4.55,6.64,0.61],[9.15,7.75,0.55],
    [9.55,4.95,0.75],[9.45,-0.68,0.66],[8.2,-3.76,0.43],[5.85,-3.9,0.73],[4.9,-3.7,0.47],[-3.55,-8.35,0.56],
    [-5.35,-2.67,0.85],[-6.55,0.55,0.49],[-4.85,5.85,0.39],[-8.6,5.5,0.8],[4.2,9.45,0.65],[13.0,2.4,0.64],
    [4.8,-6.55,0.57],[11.7,-2.6,0.69],[3.1,-8.1,0.49],[-1.25,-8.9,0.71]]) {
    yucca(x, z, size, color(random() > 0.52 ? '#7d8962' : '#918f63'));
    const direction = random() * 2 * Math.PI, offset = size * (0.5 + random() * .55);
    if (random() > .25) yucca(x - Math.cos(direction) * offset, z + Math.sin(direction) * offset, size * .61, color('#928658'));
    if (random() > .22) pebble(x + Math.sin(direction) * offset, z - Math.cos(direction) * offset, size * .49, color('#ac8463'));
    if (random() > .6) pebble(x + size * .81, z - size * .28, size * .19, color('#c39b76'));
  }

  // A small stone-edged herb bed fills the patch beside the kitchen window.
  const bed = [[3.63,5.45],[4.36,5.36],[5.18,5.57],[5.55,5.96],[5.36,6.46],[4.78,6.85],[3.86,6.73],[3.56,6.21]];
  const bedCentre = [4.57, .024, 6.06], loam = color('#897451');
  bed.forEach(([x,z], i) => {
    const [nx,nz] = bed[(i + 1) % bed.length];
    triangle([x,turfLevel(x,z) + .018,z], [nx,turfLevel(nx,nz) + .018,nz], bedCentre, loam);
    for (let j = 0; j < 3; j++) {
      const t = (j + .3 + random() * .32) / 3;
      pebble(x + (nx - x) * t, z + (nz - z) * t, .091 + random() * .061, color('#a59b76'));
    }
  });
  for (const [x,z,size] of [[3.91,5.77,.47],[4.46,5.65,.47],[4.95,5.91,.54],[4.14,6.23,.48],[4.66,6.41,.58],[5.04,6.27,.39]]) {
    const leaf = color(random() > .5 ? '#708450' : '#687d54');
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4, dx = Math.cos(a), dz = Math.sin(a), spread = size * (.35 + random() * .27);
      const centre = [x + dx * spread * .57, size * .66, z + dz * spread * .57];
      const tip = [x + dx * spread, size * .48, z + dz * spread], base = [x, .024, z];
      for (const side of [-1,1]) {
        const edge = [centre[0] + side * dz * size * .15, centre[1] - size * .14, centre[2] - side * dx * size * .15];
        const tint = side < 0 ? leaf : leaf.clone().multiplyScalar(1.22);
        triangle(base, edge, centre, tint); triangle(centre, edge, tip, tint);
      }
    }
  }

  // Split firewood stacked against the dry side of the house.
  const bark = color('#796045'), cut = color('#b79565'), radius = .185;
  for (const [row, count] of [[0,3],[1,2],[2,1]]) {
    for (let i = 0; i < count; i++) {
      const x = 3.92 + (i + row * .5) * .216;
      const y = turfLevel(x, -6.02) + radius * (1 + row * 1.74), end = -6.56 - (i % 2) * .08;
      const ring = Array.from({ length: 7 }, (_, j) => {
        const angle = j * Math.PI * 2 / 7 + i * .13;
        return [x + Math.cos(angle) * radius / ROOM_FLOOR_SCALE, y + Math.sin(angle) * radius];
      });
      ring.forEach(([ax,ay], j) => {
        const [bx,by] = ring[(j + 1) % ring.length];
        quad([ax,ay,end], [bx,by,end], [bx,by,end + 1.1], [ax,ay,end + 1.1], bark.clone().multiplyScalar(.82 + .22 * Math.sin(j)));
        triangle([ax,ay,end], [bx,by,end], [x,y,end], cut);
        triangle([ax,ay,end + 1.1], [bx,by,end + 1.1], [x,y,end + 1.1], cut);
      });
    }
  }

  // Bunchgrass survives along the margins of the garden, outside the editable wagon bay.
  for (const [x, z, radius] of [[4.2,6.7,.48],[5.05,6.35,.36],[6.35,7.11,.66],[7.4,6.45,.32],[8.82,5.75,.41],
    [9.01,4.0,.25],[8.83,-1.77,.31],[8.29,-5.35,.36],[6.95,-6.44,.60],[5.28,-6.87,.47],[4.62,-5.55,.32]]) {
    for (let i = 0; i < 12; i++) {
      const bx = x + (random() - .5) * radius * 2, bz = z + (random() - .5) * radius;
      const groundY = turfLevel(bx, bz) + .012;
      const paint = color(random() > .49 ? '#84925e' : z < 0 ? '#ac995f' : '#748956');
      for (let j = 0; j < 5; j++) {
        const angle = random() * Math.PI * 2, nx = Math.cos(angle), nz = Math.sin(angle);
        const h = .08 + random() * .22, half = .012 + random() * .015;
        triangle([bx - nz * half, groundY, bz + nx * half], [bx + nz * half, groundY, bz - nx * half],
          [bx + nx * h * .43, groundY + h, bz + nz * h * .43], paint);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const country = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  country.name = 'red-rock-country';
  group.add(country);
  return group;
}
