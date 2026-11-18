import * as THREE from 'three';
import { ROOM_FLOOR_SCALE } from '../../../server/catalog/room.js';
import { ROOM_GRADE } from './scene-model.js';

// A panorama behind the far edge of the yard gives an overhead orthographic view a horizon.
export function desertHorizon(soilMaterial) {
  const width = 1024, height = 128, pixels = new Uint8Array(width * height * 4);
  const mesaLine = [[0,0], [.10,.21], [.25,.32], [.28,.65], [.32,.68], [.34,.94], [.68,1], [.71,.96], [.74,.68], [.80,.66], [.83,.27], [1,0]];
  const buttes = [[.025,.106,.24], [.098,.057,.37], [.157,.125,.27], [.261,.081,.35], [.313,.033,.25], [.416,.107,.33], [.486,.042,.18], [.602,.19,.32], [.659,.06,.48], [.776,.128,.25], [.883,.122,.30], [.968,.043,.37]];
  const tau = Math.PI * 2;
  for (let x = 0; x < width; x++) {
    const u = x / width, a = tau * u;
    const ridges = .32 + .078 * Math.sin(a * 4 + .4) + .046 * Math.cos(a * 11) + .012 * Math.sin(a * 23);
    const middle = .245 + .039 * Math.cos(a * 7 - .4) + .018 * Math.sin(a * 17) + .007 * Math.sin(a * 51);
    const toe = .118 + .026 * Math.cos(a * 8) + .018 * Math.sin(a * 13);
    const sand = .054 + .018 * Math.cos(a * 7 - 1) + .007 * Math.sin(a * 29);
    let mesa = toe, face = 0;
    const sunX = (u - .222) / .0057, cloud = .62 + .047 * Math.sin(a * 3 + .38);
    const cloudWidths = Math.cos(a * 8) + .48 * Math.sin(a * 11) - .94;
    for (const [centre, span, rise] of buttes) {
      const s = ((u - centre + 1.5) % 1 - .5) / span + .5;
      if (s < 0 || s >= 1) continue;
      const right = mesaLine.findIndex(([at]) => at > s), [a0,h0] = mesaLine[right - 1], [a1,h1] = mesaLine[right];
      const h = toe + rise * (h0 + (h1 - h0) * (s - a0) / (a1 - a0));
      if (h > mesa) { mesa = h; face = s; }
    }
    for (let y = 0; y < height; y++) {
      const v = y / height, dusk = Math.min(1, v * 1.22), i = (y * width + x) * 4;
      let r = 249 - 95 * dusk, g = 214 - 32 * dusk, b = 168 + 21 * dusk;
      const sun = sunX * sunX + ((v - .485) / .075) ** 2;
      if (sun < 1) { r = 252; g = 227; b = 177; }
      if (cloudWidths > 0 && Math.abs(v - cloud) < cloudWidths * .046) { r += 12; g += 8; b += 3; }
      if (v < ridges) { r = 178; g = 157; b = 146; }
      if (v < middle) { r = 193; g = 158; b = 138; }
      if (v < mesa) {
        const lit = 8 * Math.sin(3.1 * face + .4) - (face < .43 + .16 * (v - toe) ? 9 : 0) + 2 * Math.cos(19 * face);
        const seam = v > mesa - .016 ? 9 : v > toe + .045 && Math.cos(v * 155 + 2 * Math.sin(a * 4)) > .81 ? 5 : 0;
        r = 185 + lit + seam; g = 127 + lit + seam; b = 98 + lit + seam;
      }
      if (v < toe) { r = 197; g = 148; b = 111; }
      if (v < sand) { r = 201; g = 155; b = 111; }
      pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = 255;
    }
  }
  const map = new THREE.DataTexture(pixels, width, height);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping;
  map.minFilter = map.magFilter = THREE.LinearFilter; map.needsUpdate = true;
  const uniforms = { map: { value: map }, frame: { value: new THREE.Vector4() }, depthSlope: { value: 0 } };
  soilMaterial.onBeforeCompile = shader => {
    shader.uniforms.ranchHorizon = uniforms.frame;
    shader.vertexShader = 'varying float ranchScreenY;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n ranchScreenY = gl_Position.y / gl_Position.w;');
    shader.fragmentShader = 'varying float ranchScreenY; uniform vec4 ranchHorizon;\n' + shader.fragmentShader.replace('#include <opaque_fragment>',
      '#include <opaque_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.584, 0.328, 0.159), smoothstep(ranchHorizon.z - 0.26, ranchHorizon.z, ranchScreenY));');
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 screen; uniform vec4 frame; uniform float depthSlope; void main() { screen = position.xy; gl_Position = vec4(screen, clamp(frame.w + (screen.y - frame.z) * depthSlope, -0.999, 0.999), 1.); }',
    fragmentShader: `uniform sampler2D map; uniform vec4 frame; varying vec2 screen;
      void main() {
        gl_FragColor = texture2D(map, vec2(frame.x + screen.x * frame.y, (screen.y - frame.z) * 1.92));
        #include <colorspace_fragment>
      }`,
  });
  // The scene's shared disposal walks material maps, including this shader's panorama.
  material.map = map;
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  backdrop.name = 'ranch-horizon'; backdrop.frustumCulled = false; backdrop.renderOrder = -10;
  const S = ROOM_FLOOR_SCALE, forward = new THREE.Vector3(), point = new THREE.Vector3();
  // Ground outline includes both wings, the fenced yard and the signpost at the road.
  const yard = [[-4.3, -7.3], [3.8, -7.45], [8.9, -7.45], [9.6, 3.9], [8.9, 7.45], [3.5, 7.45], [-3.1, 7.4], [-4.3, 3.6]], earth = ROOM_GRADE - 0.13;
  backdrop.onBeforeRender = (renderer, scene, camera) => {
    camera.getWorldDirection(forward);
    let skyline = 0.50;
    for (const [x,z] of yard) skyline = Math.max(skyline, point.set(x * S, earth, z * S).project(camera).y + 0.07);
    point.set(0, skyline, 0).unproject(camera);
    point.addScaledVector(forward, (earth - point.y) / forward.y);
    const top = point.clone(); top.y += 1; top.project(camera);
    const depth = point.project(camera).z;
    // An upright backdrop clips distant rocks at their bases; a camera-facing plane cuts their tops loose.
    uniforms.depthSlope.value = (top.z - depth) / (top.y - point.y);
    uniforms.frame.value.set(Math.atan2(forward.x, -forward.z) / tau + .265, (camera.right - camera.left) / (camera.top - camera.bottom) * .11, skyline, Math.min(.999, depth));
  };
  return backdrop;
}
