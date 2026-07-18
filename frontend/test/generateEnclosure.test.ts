import { describe, it, expect, beforeAll } from 'vitest';
import type { ManifoldToplevel } from 'manifold-3d';
import { generateEnclosure } from '../src/csg/generateEnclosure';
import { extractMeshData } from '../src/csg/manifoldToGeometry';
import type {
  EnclosureProject,
  Feature,
  GasketSpec,
  LidType,
} from '../src/types/project';
import { getTestWasm } from './helpers/wasm';
import { boundingBox, isWatertight } from './helpers/geometry';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await getTestWasm();
});

const NOW = '2026-01-01T00:00:00.000Z';

function makeBox(over: {
  lid?: LidType;
  gasket?: GasketSpec;
  corner?: 'sharp' | 'rounded' | 'chamfered';
  features?: Feature[];
}): EnclosureProject {
  return {
    id: 'test',
    name: 'test',
    units: 'mm',
    createdAt: NOW,
    updatedAt: NOW,
    body: {
      shape: 'box',
      outer: { length: 80, width: 50, height: 30 },
      wallThickness: 2,
      cornerStyle: { type: over.corner ?? 'rounded', radius: 3 },
      lid: {
        type: over.lid ?? 'screw-boss',
        splitHeight: 24,
        wallGap: 0.2,
        screw: { size: 'M3', insertType: 'heat-set', count: 4 },
        gasket: over.gasket,
      },
    },
    features: over.features ?? [],
  };
}

function makeCylinder(over: { lid?: LidType; gasket?: GasketSpec }): EnclosureProject {
  return {
    id: 'test',
    name: 'test',
    units: 'mm',
    createdAt: NOW,
    updatedAt: NOW,
    body: {
      shape: 'cylinder',
      outer: { diameter: 60, height: 40 },
      wallThickness: 2,
      lid: {
        type: over.lid ?? 'friction-lip',
        splitHeight: 30,
        wallGap: 0.2,
        screw: { size: 'M3', insertType: 'heat-set', count: 6 },
        gasket: over.gasket,
      },
    },
    features: over.features ?? [],
  };
}

/** Runs the pipeline at export quality and returns transferable meshes; always frees Manifolds. */
function generateMeshes(project: EnclosureProject) {
  const result = generateEnclosure(wasm, project, 'export');
  const base = extractMeshData(result.base);
  const lid = extractMeshData(result.lid);
  result.base.delete();
  result.lid.delete();
  return { base, lid };
}

const LID_TYPES: LidType[] = ['friction-lip', 'screw-boss', 'snap-fit'];
const GASKET: GasketSpec = { width: 2, depth: 1.5 };

describe('box enclosure: watertight + dimensions across the lid/gasket matrix', () => {
  for (const lid of LID_TYPES) {
    for (const gasket of [undefined, GASKET]) {
      it(`box / ${lid} / gasket=${gasket ? 'on' : 'off'}`, () => {
        const { base, lid: lidMesh } = generateMeshes(makeBox({ lid, gasket }));

        expect(isWatertight(base), 'base watertight').toBe(true);
        expect(isWatertight(lidMesh), 'lid watertight').toBe(true);

        // Outer bbox equals L x W regardless of corner rounding (rounding insets, never grows).
        const bb = boundingBox(base);
        expect(bb.size[0]).toBeCloseTo(80, 0);
        expect(bb.size[1]).toBeCloseTo(50, 0);
        // Base is the below-split portion, so it should not exceed the split height.
        expect(bb.size[2]).toBeLessThanOrEqual(24 + 0.5);
      });
    }
  }
});

describe('cylinder enclosure: watertight + dimensions across the lid/gasket matrix', () => {
  for (const lid of LID_TYPES) {
    for (const gasket of [undefined, GASKET]) {
      it(`cylinder / ${lid} / gasket=${gasket ? 'on' : 'off'}`, () => {
        const { base, lid: lidMesh } = generateMeshes(makeCylinder({ lid, gasket }));

        expect(isWatertight(base), 'base watertight').toBe(true);
        expect(isWatertight(lidMesh), 'lid watertight').toBe(true);

        const bb = boundingBox(base);
        expect(bb.size[0]).toBeCloseTo(60, 0);
        expect(bb.size[1]).toBeCloseTo(60, 0);
      });
    }
  }
});

describe('sharp-corner box has an exact outer bounding box', () => {
  it('bbox equals nominal L x W x splitHeight', () => {
    const { base } = generateMeshes(makeBox({ corner: 'sharp' }));
    const bb = boundingBox(base);
    expect(bb.min[0]).toBeCloseTo(-40, 1);
    expect(bb.max[0]).toBeCloseTo(40, 1);
    expect(bb.min[1]).toBeCloseTo(-25, 1);
    expect(bb.max[1]).toBeCloseTo(25, 1);
    expect(bb.min[2]).toBeCloseTo(0, 1);
  });
});

describe('each feature type keeps both pieces watertight', () => {
  const base = { id: 'f', type: '' as Feature['type'], u: 0.5, v: 0.5, rotationDeg: 0 };

  const cases: Array<{ name: string; feature: Feature }> = [
    {
      name: 'connector cutout (front face)',
      feature: { ...base, id: 'c', type: 'connector-cutout', face: 'front', connectorId: 'sma-bulkhead-female' },
    },
    {
      name: 'rect connector cutout on right face (guards the 90-degree bug)',
      feature: {
        ...base,
        id: 'c2',
        type: 'connector-cutout',
        face: 'right',
        connectorId: 'usb-c-panel',
        connectorOverride: { width: 12, height: 6 },
      },
    },
    {
      name: 'slot vent',
      feature: {
        ...base,
        id: 'v',
        type: 'vent',
        face: 'front',
        vent: { pattern: 'slots', areaWidth: 30, areaHeight: 15, slotWidth: 2, slotSpacing: 5 },
      },
    },
    {
      name: 'honeycomb vent',
      feature: {
        ...base,
        id: 'v2',
        type: 'vent',
        face: 'top',
        vent: { pattern: 'honeycomb', areaWidth: 30, areaHeight: 20, slotWidth: 4, slotSpacing: 6 },
      },
    },
    {
      name: 'custom circular hole',
      feature: { ...base, id: 'h', type: 'custom-hole', face: 'back', custom: { shape: 'circle', width: 8 } },
    },
    {
      name: 'standoff on floor',
      feature: {
        ...base,
        id: 's',
        type: 'standoff',
        face: 'bottom',
        standoff: { outerDiameter: 6, screwHoleDiameter: 2.5, height: 8 },
      },
    },
    {
      name: 'board mount (4 standoffs)',
      feature: {
        ...base,
        id: 'b',
        type: 'board-mount',
        face: 'bottom',
        board: {
          boardWidth: 50,
          boardDepth: 40,
          boardThickness: 1.6,
          holes: [
            { x: -21.5, y: -16.5 },
            { x: 21.5, y: -16.5 },
            { x: -21.5, y: 16.5 },
            { x: 21.5, y: 16.5 },
          ],
          standoff: { outerDiameter: 6, screwHoleDiameter: 2.2, height: 4 },
        },
      },
    },
  ];

  for (const { name, feature } of cases) {
    it(name, () => {
      const { base: baseMesh, lid } = generateMeshes(makeBox({ features: [feature] }));
      expect(isWatertight(baseMesh), 'base watertight').toBe(true);
      expect(isWatertight(lid), 'lid watertight').toBe(true);
    });
  }

  it('all features at once stay watertight', () => {
    const { base: baseMesh, lid } = generateMeshes(makeBox({ features: cases.map((c) => c.feature) }));
    expect(isWatertight(baseMesh), 'base watertight').toBe(true);
    expect(isWatertight(lid), 'lid watertight').toBe(true);
  });
});
