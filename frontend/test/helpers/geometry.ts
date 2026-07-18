import type { MeshData } from '../../src/csg/workerProtocol';

export interface BBox {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
}

export function boundingBox(mesh: MeshData): BBox {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = p[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/**
 * A closed 2-manifold surface: every undirected edge is shared by exactly two triangles.
 * Vertices are quantized and merged first, because getMesh() can emit geometrically-coincident
 * vertices under distinct indices -- counting raw index edges would spuriously report holes.
 */
export function isWatertight(mesh: MeshData): boolean {
  const { positions, indices } = mesh;
  const keyToId = new Map<string, number>();
  const remap = new Int32Array(positions.length / 3);
  for (let v = 0; v < positions.length / 3; v++) {
    const key = `${quant(positions[v * 3])},${quant(positions[v * 3 + 1])},${quant(positions[v * 3 + 2])}`;
    let id = keyToId.get(key);
    if (id === undefined) {
      id = keyToId.size;
      keyToId.set(key, id);
    }
    remap[v] = id;
  }

  const edgeCounts = new Map<string, number>();
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]];
    const b = remap[indices[t + 1]];
    const c = remap[indices[t + 2]];
    if (a === b || b === c || a === c) return false; // degenerate triangle
    bumpEdge(edgeCounts, a, b);
    bumpEdge(edgeCounts, b, c);
    bumpEdge(edgeCounts, c, a);
  }

  for (const count of edgeCounts.values()) {
    if (count !== 2) return false;
  }
  return true;
}

function quant(x: number): number {
  return Math.round(x * 1000); // 1 micron -- tighter than any real feature, looser than FP noise
}

function bumpEdge(counts: Map<string, number>, a: number, b: number): void {
  const key = a < b ? `${a}_${b}` : `${b}_${a}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
