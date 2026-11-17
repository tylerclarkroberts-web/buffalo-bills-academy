import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** The near wall keeps its silhouette and openings. Trim, artwork and click targets stay on the solid side. */
export function makeWallCutaway(side, solid, panels) {
  solid.updateWorldMatrix(true, true);
  const toParent = solid.parent.matrixWorld.clone().invert();
  const shapes = panels.map(panel => panel.geometry.clone().applyMatrix4(
    new THREE.Matrix4().multiplyMatrices(toParent, panel.matrixWorld)));
  const geometry = mergeGeometries(shapes);
  for (const shape of shapes) shape.dispose();
  const ghost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: '#d4b798', opacity: 0.14, transparent: true, depthWrite: false,
  }));
  ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({
    color: '#765b42', opacity: 0.34, transparent: true, depthWrite: false,
  })));
  ghost.name = side + ' wall cutaway';
  ghost.visible = false;
  solid.parent.add(ghost);
  return { side, solid, ghost };
}
