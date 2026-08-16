import { describe, it, expect, beforeAll } from 'vitest';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { generateEnclosure } from '../src/csg/generateEnclosure';
import { MIN_SKIN } from '../src/csg/printRules';
import type { EnclosureProject, ExternalMountHoleStyle, ExternalMountSpec } from '../src/types/project';
import { getTestWasm } from './helpers/wasm';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await getTestWasm();
});

const LENGTH = 80;
const PROTRUSION = 10;

function project(mount: ExternalMountSpec): EnclosureProject {
  return {
    id: 'test',
    name: 'test',
    units: 'mm',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    body: {
      shape: 'box',
      outer: { length: LENGTH, width: 50, height: 30 },
      wallThickness: 2.4,
      cornerStyle: { type: 'rounded', radius: 3 },
      lid: { type: 'friction-lip', splitHeight: 24, wallGap: 0.2 },
    },
    features: [
      { id: 'm', type: 'external-mount', face: 'right', u: 0.5, v: 0.3, rotationDeg: 0, mount },
    ],
  };
}

function baseOf(p: EnclosureProject): { base: Manifold; free: () => void } {
  const result = generateEnclosure(wasm, p, 'export');
  const base = result.parts.find((part) => part.id === 'base')!.manifold;
  return {
    base,
    free: () => {
      for (const part of result.parts) part.manifold.delete();
    },
  };
}

/**
 * How much material is left on the tab's own centreline between the end of the hole and the tip.
 * `flangeHoleCrossSection` used to check its hole against nothing at all: an over-long slot came
 * out as an open-ended fork (0mm here), and the stock CM4 wall tab -- a 9mm slot in 10mm of
 * reach -- came out with 0.5mm.
 */
function tipMaterial(base: Manifold, z: number): number {
  const tip = LENGTH / 2 + PROTRUSION;
  const probe = wasm.Manifold.cube([4, 1, 4], false).translate(tip - 4, -0.5, z - 2);
  const hit = base.intersect(probe);
  const thickness = hit.isEmpty() ? 0 : hit.boundingBox().max[0] - hit.boundingBox().min[0];
  hit.delete();
  probe.delete();
  return thickness;
}

describe('external mount holes vs. the ear they are cut in', () => {
  const styles: ExternalMountHoleStyle[] = ['round', 'slot', 'keyhole'];

  for (const hole of styles) {
    it(`keeps a ${hole} hole inside the tab even when it is asked for a bigger one`, () => {
      // Deliberately impossible: a hole as long as the mount's entire reach.
      const p = project({
        style: 'flange',
        width: 16,
        protrusion: PROTRUSION,
        thickness: 3,
        hole,
        holeDiameter: 5,
        slotLength: PROTRUSION + 4,
        gusset: 0,
      });
      const { base, free } = baseOf(p);
      const measured = tipMaterial(base, 30 * 0.3);
      free();
      expect(measured, `${hole} tab tip`).toBeGreaterThanOrEqual(MIN_SKIN - 0.05);
    });
  }

  it('leaves the stock CM4 wall tab a printable tip', () => {
    // The shipped preset's own numbers: 10mm of reach with a 9mm slot centred at 5mm, which used
    // to leave 0.5mm at the tip.
    const p = project({
      style: 'flange',
      width: 16,
      protrusion: PROTRUSION,
      thickness: 3,
      hole: 'slot',
      holeDiameter: 5,
      slotLength: 9,
    });
    const { base, free } = baseOf(p);
    const measured = tipMaterial(base, 30 * 0.3);
    free();
    expect(measured).toBeGreaterThanOrEqual(MIN_SKIN - 0.05);
  });
});
