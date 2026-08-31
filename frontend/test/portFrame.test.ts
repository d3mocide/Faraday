import { beforeAll, describe, expect, it } from 'vitest';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { generateEnclosure } from '../src/csg/generateEnclosure';
import { extractMeshData } from '../src/csg/manifoldToGeometry';
import { createDefaultProject } from '../src/state/defaultProject';
import { isWatertight } from './helpers/geometry';
import { getTestWasm } from './helpers/wasm';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await getTestWasm();
});

function solidAt(part: Manifold, [x, y, z]: [number, number, number]): boolean {
  const probe = wasm.Manifold.cube([0.3, 0.3, 0.3], true).translate(x, y, z);
  const hit = part.intersect(probe);
  const result = !hit.isEmpty();
  hit.delete();
  probe.delete();
  return result;
}

describe('reinforced port frames', () => {
  it('adds material around, but never into, a functional top opening', () => {
    const project = createDefaultProject();
    if (project.body.shape !== 'box') throw new Error('default project must stay a box');
    project.features = [{
      id: 'port', type: 'custom-hole', face: 'top', u: 0.5, v: 0.5, rotationDeg: 0,
      custom: { shape: 'circle', width: 6 }, portFrame: {},
    }];
    const result = generateEnclosure(wasm, project, 'export');
    const lid = result.parts.find((part) => part.id === 'lid')!.manifold;
    const top = project.body.outer.height;
    expect(solidAt(lid, [0, 0, top + 0.4])).toBe(false);
    expect(solidAt(lid, [4, 0, top + 0.4])).toBe(true);
    expect(isWatertight(extractMeshData(lid))).toBe(true);
    for (const part of result.parts) part.manifold.delete();
  });
});
