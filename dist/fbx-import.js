import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Bake each mesh independently so nested FBX meshes keep their placement without
// importing their descendants a second time. Only static geometry enters Etch.
export function parseMeshFBX(buffer) {
  let parsed;
  const root = new THREE.Group(), point = new THREE.Vector3();
  try {
    parsed = new FBXLoader().parse(buffer, '', true);
    parsed.updateMatrixWorld(true);
    parsed.traverse(node => { if (node.isSkinnedMesh) node.skeleton.update(); });
    parsed.traverse(node => {
      if (!node.isMesh || !node.geometry?.attributes.position?.count) return;
      const geometry = node.geometry.clone();
      if (node.isSkinnedMesh || node.morphTargetInfluences?.some(weight => weight !== 0)) {
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          node.getVertexPosition(i, point);
          positions.setXYZ(i, point.x, point.y, point.z);
        }
      }
      geometry.morphAttributes = {};
      geometry.deleteAttribute('skinIndex');
      geometry.deleteAttribute('skinWeight');
      geometry.applyMatrix4(node.matrixWorld);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      mesh.name = (node.userData.originalName || node.name).replace(/^(?:Model|Geometry)::/, '');
      root.add(mesh);
    });
    return root;
  } catch (error) {
    root.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
    throw new Error(`Could not read FBX geometry: ${error.message}`);
  } finally {
    parsed?.traverse(node => {
      node.geometry?.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) material?.dispose();
      node.skeleton?.dispose();
    });
  }
}
