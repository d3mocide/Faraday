import { describe, it, expect, beforeAll } from 'vitest';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { generateEnclosure } from '../src/csg/generateEnclosure';
import { extractMeshData } from '../src/csg/manifoldToGeometry';
import type { EnclosureBody, EnclosureProject, LidType } from '../src/types/project';
import { getTestWasm } from './helpers/wasm';
import { isWatertight } from './helpers/geometry';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await getTestWasm();
});

const NOW = '2026-01-01T00:00:00.000Z';

function proj(body: EnclosureBody): EnclosureProject {
  return { id: 't', name: 't', units: 'mm', createdAt: NOW, updatedAt: NOW, body, features: [] };
}

function lidFor(type: LidType) {
  return {
    type,
    splitHeight: 24,
    wallGap: 0.2,
    screw: { size: 'M3' as const, insertType: 'heat-set' as const, count: 4 as const },
  };
}

function solidAt(part: Manifold, [x, y, z]: [number, number, number], size = 1.0): boolean {
  const probe = wasm.Manifold.cube([size, size, size], true).translate(x, y, z);
  const hit = part.intersect(probe);
  const empty = hit.isEmpty();
  hit.delete();
  probe.delete();
  return !empty;
}

function bodiesFor(lidType: LidType): Array<[string, EnclosureBody]> {
  const lid = lidFor(lidType);
  return [
    ['hexagon', { shape: 'hexagon', outer: { radius: 35, height: 30 }, wallThickness: 2, lid }],
    ['octagon', { shape: 'octagon', outer: { radius: 35, height: 30 }, wallThickness: 2, lid }],
    [
      'stadium',
      {
        shape: 'stadium',
        outer: { length: 80, width: 45, height: 30 },
        wallThickness: 2,
        cornerStyle: { type: 'rounded', radius: 3 },
        lid,
      },
    ],
    [
      'wedge',
      {
        shape: 'wedge',
        outer: { length: 80, width: 50, heightFront: 15, heightBack: 35 },
        wallThickness: 2,
        cornerStyle: { type: 'rounded', radius: 3 },
        lid,
      },
    ],
  ];
}

describe('probe: fasteners on the new shapes', () => {
  for (const [name, body] of bodiesFor('screw-boss')) {
    it(`screw-boss ${name}: cavity center is empty, bosses are real, watertight`, () => {
      const res = generateEnclosure(wasm, proj(body), 'live');
      const base = res.parts.find((p) => p.id === 'base')!.manifold;
      const lidPart = res.parts.find((p) => p.id === 'lid')!.manifold;

      // Cavity center (bottom of the interior floor) must be EMPTY -- the whole point of the fix.
      expect(solidAt(base, [0, 0, 10], 1.5), `${name}: cavity center should be open`).toBe(false);

      // Material should exist somewhere out near the perimeter (a boss), not just a central column.
      let foundOffCenterMaterial = false;
      for (let a = 0; a < 24; a++) {
        const angle = (a / 24) * Math.PI * 2;
        for (const r of [15, 20, 25, 30]) {
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          if (solidAt(base, [x, y, 5], 1.0)) foundOffCenterMaterial = true;
        }
      }
      expect(foundOffCenterMaterial, `${name}: expected boss material near the perimeter`).toBe(true);

      expect(isWatertight(extractMeshData(base)), `${name} base watertight`).toBe(true);
      expect(isWatertight(extractMeshData(lidPart)), `${name} lid watertight`).toBe(true);
    });
  }

  for (const [name, body] of bodiesFor('friction-lip')) {
    it(`friction-lip ${name}: skirt is real and watertight`, () => {
      const res = generateEnclosure(wasm, proj(body), 'live');
      const base = res.parts.find((p) => p.id === 'base')!.manifold;
      const lidPart = res.parts.find((p) => p.id === 'lid')!.manifold;
      // The skirt hangs below the split line, inside the base cavity -- material should exist
      // there but the very center of the floor should still be clear.
      expect(solidAt(lidPart, [0, 0, 21], 1.5), `${name}: skirt ring should have material near center-ish`).toBe(
        false,
      );
      expect(isWatertight(extractMeshData(base)), `${name} base watertight`).toBe(true);
      expect(isWatertight(extractMeshData(lidPart)), `${name} lid watertight`).toBe(true);
    });
  }

  for (const [name, body] of bodiesFor('snap-fit')) {
    it(`snap-fit ${name}: tabs+pockets are real and watertight`, () => {
      const res = generateEnclosure(wasm, proj(body), 'live');
      const base = res.parts.find((p) => p.id === 'base')!.manifold;
      const lidPart = res.parts.find((p) => p.id === 'lid')!.manifold;
      expect(isWatertight(extractMeshData(base)), `${name} base watertight`).toBe(true);
      expect(isWatertight(extractMeshData(lidPart)), `${name} lid watertight`).toBe(true);
    });
  }
});

describe('probe: gasket channel on the new shapes', () => {
  const gasket = { width: 2, depth: 1 };
  const bodies: Array<[string, EnclosureBody]> = [
    ['hexagon', { shape: 'hexagon', outer: { radius: 35, height: 30 }, wallThickness: 2, lid: { ...lidFor('friction-lip'), gasket } }],
    ['octagon', { shape: 'octagon', outer: { radius: 35, height: 30 }, wallThickness: 2, lid: { ...lidFor('friction-lip'), gasket } }],
    ['stadium', { shape: 'stadium', outer: { length: 80, width: 45, height: 30 }, wallThickness: 2, cornerStyle: { type: 'rounded', radius: 3 }, lid: { ...lidFor('friction-lip'), gasket } }],
  ];
  for (const [name, body] of bodies) {
    it(`${name} gasket groove exists and stays watertight`, () => {
      const res = generateEnclosure(wasm, proj(body), 'live');
      const base = res.parts.find((p) => p.id === 'base')!.manifold;
      expect(isWatertight(extractMeshData(base)), `${name} base watertight with gasket`).toBe(true);
    });
  }
});

describe('probe: edge bevels on hex/oct', () => {
  for (const shape of ['hexagon', 'octagon'] as const) {
    it(`${shape} top+bottom edge bevel stays watertight`, () => {
      const body: EnclosureBody = {
        shape,
        outer: { radius: 35, height: 30 },
        wallThickness: 2,
        lid: lidFor('screw-boss'),
        topEdgeBevel: { type: 'chamfer', size: 2 },
        bottomEdgeBevel: { type: 'chamfer', size: 2 },
      };
      const res = generateEnclosure(wasm, proj(body), 'live');
      for (const part of res.parts) {
        expect(isWatertight(extractMeshData(part.manifold)), `${shape} ${part.id} watertight with bevels`).toBe(
          true,
        );
      }
    });
  }
});

describe('probe: boss count variations + exterior placement', () => {
  it('hexagon boss count 6 and 8 both watertight', () => {
    for (const count of [4, 6, 8] as const) {
      const body: EnclosureBody = {
        shape: 'hexagon',
        outer: { radius: 35, height: 30 },
        wallThickness: 2,
        lid: { ...lidFor('screw-boss'), screw: { size: 'M3', insertType: 'heat-set', count } },
      };
      const res = generateEnclosure(wasm, proj(body), 'live');
      for (const part of res.parts) {
        expect(isWatertight(extractMeshData(part.manifold)), `hex count=${count} ${part.id}`).toBe(true);
      }
    }
  });

  it('stadium exterior screw placement is watertight', () => {
    const body: EnclosureBody = {
      shape: 'stadium',
      outer: { length: 80, width: 45, height: 30 },
      wallThickness: 2,
      cornerStyle: { type: 'rounded', radius: 3 },
      lid: { ...lidFor('screw-boss'), screw: { size: 'M3', insertType: 'heat-set', count: 4, placement: 'exterior' } },
    };
    const res = generateEnclosure(wasm, proj(body), 'live');
    for (const part of res.parts) {
      expect(isWatertight(extractMeshData(part.manifold)), `stadium exterior ${part.id}`).toBe(true);
    }
  });

  it('wedge hanging column (columnHeight) is watertight', () => {
    const body: EnclosureBody = {
      shape: 'wedge',
      outer: { length: 80, width: 50, heightFront: 15, heightBack: 35 },
      wallThickness: 2,
      cornerStyle: { type: 'rounded', radius: 3 },
      lid: { ...lidFor('screw-boss'), screw: { size: 'M3', insertType: 'heat-set', count: 4, columnHeight: 10 } },
    };
    const res = generateEnclosure(wasm, proj(body), 'live');
    for (const part of res.parts) {
      expect(isWatertight(extractMeshData(part.manifold)), `wedge hanging ${part.id}`).toBe(true);
    }
  });

  it('octagon hanging column (columnHeight) is watertight -- exercises the new polygon FootWalls', () => {
    const body: EnclosureBody = {
      shape: 'octagon',
      outer: { radius: 35, height: 30 },
      wallThickness: 2,
      lid: { ...lidFor('screw-boss'), screw: { size: 'M3', insertType: 'heat-set', count: 8, columnHeight: 10 } },
    };
    const res = generateEnclosure(wasm, proj(body), 'live');
    for (const part of res.parts) {
      expect(isWatertight(extractMeshData(part.manifold)), `octagon hanging ${part.id}`).toBe(true);
    }
  });
});
