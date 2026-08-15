import { describe, it, expect, beforeAll } from 'vitest';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { generateEnclosure } from '../src/csg/generateEnclosure';
import { extractMeshData } from '../src/csg/manifoldToGeometry';
import { bodyGeometry, faceFrame } from '../src/csg/faceFrame';
import type { EnclosureBody, EnclosureProject, Feature } from '../src/types/project';
import { getTestWasm } from './helpers/wasm';
import { isWatertight } from './helpers/geometry';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await getTestWasm();
});

const NOW = '2026-01-01T00:00:00.000Z';

function solidAt(part: Manifold, [x, y, z]: [number, number, number], size = 1.0): boolean {
  const probe = wasm.Manifold.cube([size, size, size], true).translate(x, y, z);
  const hit = part.intersect(probe);
  const empty = hit.isEmpty();
  hit.delete();
  probe.delete();
  return !empty;
}

const bossMount: Feature['mount'] = {
  style: 'boss',
  width: 6,
  protrusion: 8,
  thickness: 4,
  hole: 'none',
  holeDiameter: 3,
  slotLength: 6,
  gusset: 0, // keep the probe geometry a clean 3mm-radius cylinder, no root flare to muddy it
};

// Regression coverage for the 2026-08-15 fix: orientOutward had no cases for hex/oct facets or a
// wedge's slanted-top, so an external-mount boss placed there fell through to the 'default' branch
// (built for front/back) and pointed the wrong way relative to the actual wall.
describe('orientOutward: external-mount boss actually protrudes along the face normal', () => {
  it('hexagon facet f1: boss material sits outward of the wall along f1s own normal, not elsewhere', () => {
    const body: EnclosureBody = {
      shape: 'hexagon',
      outer: { radius: 35, height: 30 },
      wallThickness: 2,
      lid: { type: 'friction-lip', splitHeight: 15, wallGap: 0.2 },
    };
    const geom = bodyGeometry(body);
    const feature: Feature = {
      id: 'm1',
      type: 'external-mount',
      face: 'f1',
      u: 0.5,
      v: 0.5,
      rotationDeg: 0,
      mount: bossMount,
    };
    const project: EnclosureProject = { id: 't', name: 't', units: 'mm', createdAt: NOW, updatedAt: NOW, body, features: [feature] };
    const res = generateEnclosure(wasm, project, 'live');
    const base = res.parts.find((p) => p.id === 'base')!.manifold;

    const [x, y, z] = faceFrame('f1', geom).toWorld(0.5, 0.5);
    const [nx, ny] = faceFrame('f1', geom).normalAt(0.5, 0.5);
    // A point pushed further out along f1's own outward normal (well past the wall) should be
    // solid -- the boss protruding as expected.
    expect(solidAt(base, [x + nx * 6, y + ny * 6, z], 1.5), 'boss protrudes along f1 normal').toBe(true);
    // A point the same distance out along the OPPOSITE normal (f4, 180deg away) should NOT be
    // solid -- confirms the boss isn't just pointing in some fixed wrong direction that happens to
    // still be outside the body.
    expect(solidAt(base, [x - nx * 6, y - ny * 6, z], 1.5), 'nothing protrudes the opposite way').toBe(false);
    expect(isWatertight(extractMeshData(base)), 'base watertight').toBe(true);
  });

  it('wedge slanted-top: boss protrudes along the slope normal, not straight up', () => {
    // A steep slope (heightFront=5, heightBack=55 over a 30mm run -- ~60deg) so "straight up" and
    // "the slope's own outward normal" are clearly different directions, not a couple of degrees
    // apart where a several-mm-wide boss could plausibly straddle both probe points.
    const body: EnclosureBody = {
      shape: 'wedge',
      outer: { length: 80, width: 30, heightFront: 5, heightBack: 55 },
      wallThickness: 2,
      cornerStyle: { type: 'rounded', radius: 3 },
      lid: { type: 'friction-lip', splitHeight: 12, wallGap: 0.2 },
    };
    const geom = bodyGeometry(body);
    if (geom.shape !== 'wedge') throw new Error('expected wedge geom');
    const feature: Feature = {
      id: 'm2',
      type: 'external-mount',
      face: 'slanted-top',
      u: 0.5,
      v: 0.5,
      rotationDeg: 0,
      mount: bossMount,
    };
    const project: EnclosureProject = { id: 't', name: 't', units: 'mm', createdAt: NOW, updatedAt: NOW, body, features: [feature] };
    const res = generateEnclosure(wasm, project, 'live');
    const lid = res.parts.find((p) => p.id === 'lid')!.manifold;

    const [x, y, z] = faceFrame('slanted-top', geom).toWorld(0.5, 0.5);
    const [nx, ny, nz] = faceFrame('slanted-top', geom).normalAt(0.5, 0.5);
    // Along the true slope normal, well clear of the slab -- should be solid (the boss).
    expect(solidAt(lid, [x + nx * 6, y + ny * 6, z + nz * 6], 1.5), 'boss protrudes along slope normal').toBe(
      true,
    );
    // Straight up (what the old default-branch bug would have produced) at the same clearance
    // should NOT be solid -- the slope is tilted, so "up" and "the slope's own outward normal"
    // point in genuinely different directions here.
    expect(solidAt(lid, [x, y, z + 6], 1.5), 'nothing protrudes straight up instead').toBe(false);
    expect(isWatertight(extractMeshData(lid)), 'lid watertight').toBe(true);
  });
});
