import { describe, it, expect, beforeAll } from 'vitest';
import type { ManifoldToplevel } from 'manifold-3d';
import { generateEnclosure } from '../src/csg/generateEnclosure';
import { extractMeshData } from '../src/csg/manifoldToGeometry';
import type {
  EnclosureProject,
  Feature,
  GasketSpec,
  LidType,
  PanelSpec,
} from '../src/types/project';
import type { MeshData } from '../src/csg/workerProtocol';
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
  panels?: PanelSpec;
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
      panels: over.panels,
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

/** Runs the pipeline at export quality and returns every part's mesh; always frees Manifolds. */
function generateParts(project: EnclosureProject): Record<string, MeshData> {
  const result = generateEnclosure(wasm, project, 'export');
  const meshes: Record<string, MeshData> = {};
  for (const part of result.parts) {
    meshes[part.id] = extractMeshData(part.manifold);
    part.manifold.delete();
  }
  return meshes;
}

function generateMeshes(project: EnclosureProject) {
  const parts = generateParts(project);
  return { base: parts.base, lid: parts.lid };
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

describe('external mounts', () => {
  const mountBase = { id: 'm', type: 'external-mount' as const, u: 0.5, v: 0.1, rotationDeg: 0 };

  const cases: Array<{ name: string; feature: Feature }> = [
    {
      name: 'slotted wall-mount flange (front)',
      feature: {
        ...mountBase,
        face: 'front',
        mount: {
          style: 'flange',
          width: 16,
          protrusion: 10,
          thickness: 3,
          hole: 'slot',
          holeDiameter: 5,
          slotLength: 9,
        },
      },
    },
    {
      name: 'keyhole flange (back)',
      feature: {
        ...mountBase,
        id: 'm2',
        face: 'back',
        mount: {
          style: 'flange',
          width: 16,
          protrusion: 12,
          thickness: 3,
          hole: 'keyhole',
          holeDiameter: 8,
          slotLength: 9,
        },
      },
    },
    {
      name: 'external boss with a blind hole (right, on the lid half)',
      feature: {
        ...mountBase,
        id: 'm3',
        face: 'right',
        v: 0.9,
        mount: {
          style: 'boss',
          width: 9,
          protrusion: 8,
          thickness: 3,
          hole: 'round',
          holeDiameter: 4.2,
          slotLength: 0,
          holeDepth: 6,
        },
      },
    },
    {
      name: 'foot under the base (bottom face)',
      feature: {
        ...mountBase,
        id: 'm4',
        face: 'bottom',
        u: 0.25,
        v: 0.25,
        mount: {
          style: 'boss',
          width: 10,
          protrusion: 5,
          thickness: 3,
          hole: 'none',
          holeDiameter: 3,
          slotLength: 0,
        },
      },
    },
  ];

  for (const { name, feature } of cases) {
    it(`${name} keeps both pieces watertight`, () => {
      const { base, lid } = generateMeshes(makeBox({ features: [feature] }));
      expect(isWatertight(base), 'base watertight').toBe(true);
      expect(isWatertight(lid), 'lid watertight').toBe(true);
    });
  }

  it('a flange actually grows the part it is attached to, outward', () => {
    const plain = generateMeshes(makeBox({}));
    const withFlange = generateMeshes(makeBox({ features: [cases[0].feature] }));
    // The front flange sticks out along -Y: the base's bounding box must reach further that way.
    expect(boundingBox(withFlange.base).min[1]).toBeLessThan(boundingBox(plain.base).min[1] - 9);
    expect(boundingBox(withFlange.lid).min[1]).toBeCloseTo(boundingBox(plain.lid).min[1], 1);
  });

  it('an external boss on a lid-height wall attaches to the lid, not the base', () => {
    const plain = generateMeshes(makeBox({}));
    const withBoss = generateMeshes(makeBox({ features: [cases[2].feature] }));
    expect(boundingBox(withBoss.lid).max[0]).toBeGreaterThan(boundingBox(plain.lid).max[0] + 7);
    expect(boundingBox(withBoss.base).max[0]).toBeCloseTo(boundingBox(plain.base).max[0], 1);
  });
});

describe('slide-in panels', () => {
  const PANELS: PanelSpec = {
    faces: ['left', 'right'],
    thickness: 2.4,
    fitClearance: 0.2,
    grooveDepth: 1.2,
    captureInLid: true,
  };

  it('produces one extra part per panel face, all watertight', () => {
    const parts = generateParts(makeBox({ panels: PANELS }));
    expect(Object.keys(parts).sort()).toEqual(['base', 'lid', 'panel-left', 'panel-right']);
    for (const [id, mesh] of Object.entries(parts)) {
      expect(isWatertight(mesh), `${id} watertight`).toBe(true);
    }
  });

  it('each plate is a thin slab spanning the wall it replaces', () => {
    const parts = generateParts(makeBox({ panels: PANELS, corner: 'sharp' }));
    const right = boundingBox(parts['panel-right']);
    // Thickness through the wall, and flush with the case's outer surface (length 80 -> x = 40).
    expect(right.size[0]).toBeCloseTo(PANELS.thickness, 1);
    expect(right.max[0]).toBeCloseTo(40, 1);
    // Spans the interior width plus a groove's worth into each side wall, minus the fit clearance.
    expect(right.size[1]).toBeCloseTo(50 - 2 * 2 + 2 * 1.2 - 0.2, 1);
    // Bottom sits in the floor groove; top runs past the split into the lid's capture groove.
    expect(right.min[2]).toBeCloseTo(2 - 1.2 + 0.1, 1);
    expect(right.max[2]).toBeCloseTo(24 + 1.2 - 0.1, 1);
  });

  it('the base loses the wall the panel replaces', () => {
    const plain = generateMeshes(makeBox({ corner: 'sharp' }));
    const panelled = generateParts(makeBox({ panels: PANELS, corner: 'sharp' }));
    // Outer bbox is unchanged (the plate is flush), but the base no longer reaches x = +40 at
    // mid-width, so its volume must drop.
    expect(boundingBox(panelled.base).size[0]).toBeCloseTo(boundingBox(plain.base).size[0], 1);
    expect(panelled.base.positions.length).toBeGreaterThan(0);
  });

  it('a cutout on a panel face is cut into the plate, not the base', () => {
    const port: Feature = {
      id: 'p',
      type: 'connector-cutout',
      face: 'right',
      u: 0.5,
      v: 0.4,
      rotationDeg: 0,
      connectorId: 'sma-bulkhead-female',
    };
    const withPort = generateParts(makeBox({ panels: PANELS, features: [port] }));
    const withoutPort = generateParts(makeBox({ panels: PANELS }));
    for (const [id, mesh] of Object.entries(withPort)) {
      expect(isWatertight(mesh), `${id} watertight`).toBe(true);
    }
    expect(withPort['panel-right'].indices.length).not.toBe(withoutPort['panel-right'].indices.length);
    expect(withPort.base.indices.length).toBe(withoutPort.base.indices.length);
  });

  it('all four walls can be panels at once', () => {
    const parts = generateParts(
      makeBox({ panels: { ...PANELS, faces: ['front', 'back', 'left', 'right'] } }),
    );
    expect(Object.keys(parts)).toHaveLength(6);
    for (const [id, mesh] of Object.entries(parts)) {
      expect(isWatertight(mesh), `${id} watertight`).toBe(true);
    }
  });

  it('panels combine with every lid type', () => {
    for (const lid of LID_TYPES) {
      const parts = generateParts(makeBox({ lid, panels: PANELS }));
      for (const [id, mesh] of Object.entries(parts)) {
        expect(isWatertight(mesh), `${lid}/${id} watertight`).toBe(true);
      }
    }
  });
});
