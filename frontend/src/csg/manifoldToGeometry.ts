import type { Manifold } from 'manifold-3d';
import type { MeshData } from './workerProtocol';

/** Extracts a plain, transferable vertex/index mesh from a Manifold (worker-side only). */
export function extractMeshData(manifold: Manifold): MeshData {
  const mesh = manifold.getMesh();
  const { numProp } = mesh;

  let positions: Float32Array;
  if (numProp === 3) {
    positions = mesh.vertProperties;
  } else {
    // Only the leading x/y/z channel is needed for display/export geometry.
    const vertCount = mesh.numVert;
    positions = new Float32Array(vertCount * 3);
    for (let v = 0; v < vertCount; v++) {
      positions[v * 3] = mesh.vertProperties[v * numProp];
      positions[v * 3 + 1] = mesh.vertProperties[v * numProp + 1];
      positions[v * 3 + 2] = mesh.vertProperties[v * numProp + 2];
    }
  }

  return { positions, indices: mesh.triVerts };
}
