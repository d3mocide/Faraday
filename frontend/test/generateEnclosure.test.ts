import { describe, it, expect, beforeAll } from 'vitest';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { generateEnclosure } from '../src/csg/generateEnclosure';
import { extractMeshData } from '../src/csg/manifoldToGeometry';
import type {
  EnclosureProject,
  Feature,
  GasketSpec,
  FanMountSpec,
  LidType,
  PanelSpec,
  ScrewSpec,
} from '../src/types/project';
import type { MeshData } from '../src/csg/workerProtocol';
import { fanSpecFor } from '../src/csg/fanLibrary';
import { bossRadiusFor } from '../src/csg/primitives';
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
      name: 'rounded-edge flange (front)',
      feature: {
        ...mountBase,
        id: 'm-rounded',
        face: 'front',
        mount: {
          style: 'flange',
          width: 16,
          protrusion: 10,
          thickness: 3,
          edgeRadius: 2,
          hole: 'round',
          holeDiameter: 4.5,
          slotLength: 0,
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

  it('braces the ear into the wall at its ends, leaving the middle clear for a screwdriver', () => {
    const solids = generateSolids(makeBox({ corner: 'sharp', features: [cases[0].feature] }));
    // Front-face ear at v=0.1 on a 30mm-tall box: plate centred at z=3, 3mm thick, so it spans
    // 1.5..4.5 with no room underneath -- the webs go above it.
    const wall = -25 - 1; // 1mm out from the front wall
    expect(solidAt(solids.base, [6.24, wall, 5.2], 0.5), 'web at one end of the ear').toBe(true);
    expect(solidAt(solids.base, [-6.24, wall, 5.2], 0.5), 'web at the other end').toBe(true);
    expect(solidAt(solids.base, [0, wall, 5.2], 0.5), 'middle stays open above the hole').toBe(false);
    for (const part of Object.values(solids)) part.delete();
  });

  it('a back-wall ear braces upward like a front-wall one, not down past the floor', () => {
    const solids = generateSolids(makeBox({ corner: 'sharp', features: [cases[1].feature] }));
    // Same ear as the front-face case, on the opposite wall: plate at z=3, no room underneath.
    const wall = 25 + 1; // 1mm out from the back wall
    expect(solidAt(solids.base, [6.24, wall, 5.2], 0.5), 'web above the ear').toBe(true);
    expect(solidAt(solids.base, [6.24, wall, 0.8], 0.5), 'nothing braced below it').toBe(false);
    for (const part of Object.values(solids)) part.delete();
  });

  it('a wall ear never reaches below the print bed, whichever wall it is on', () => {
    for (const face of ['front', 'back', 'left', 'right'] as const) {
      const { base } = generateMeshes(
        makeBox({ features: [{ ...cases[0].feature, id: `ear-${face}`, face }] }),
      );
      expect(boundingBox(base).min[2], `${face} ear stays on the bed`).toBeGreaterThan(-0.01);
    }
  });

  it('the brace can be turned off', () => {
    const braced = generateSolids(makeBox({ corner: 'sharp', features: [cases[0].feature] }));
    const bare = generateSolids(
      makeBox({
        corner: 'sharp',
        features: [{ ...cases[0].feature, mount: { ...cases[0].feature.mount!, gusset: 0 } }],
      }),
    );
    expect(braced.base.volume()).toBeGreaterThan(bare.base.volume());
    expect(solidAt(bare.base, [6.24, -26, 5.2], 0.5), 'no web without a gusset').toBe(false);
    for (const part of [...Object.values(braced), ...Object.values(bare)]) part.delete();
  });

  it('a flange actually grows the part it is attached to, outward', () => {
    const plain = generateMeshes(makeBox({}));
    const withFlange = generateMeshes(makeBox({ features: [cases[0].feature] }));
    // The front flange sticks out along -Y: the base's bounding box must reach further that way.
    expect(boundingBox(withFlange.base).min[1]).toBeLessThan(boundingBox(plain.base).min[1] - 9);
    expect(boundingBox(withFlange.lid).min[1]).toBeCloseTo(boundingBox(plain.lid).min[1], 1);
  });

  it('an external boss on a lid-height wall attaches to the lid, not the base', () => {
    const plain = generateMeshes(makeBox({}));
    const withBoss = generateMeshes(makeBox({ features: [cases[3].feature] }));
    expect(boundingBox(withBoss.lid).max[0]).toBeGreaterThan(boundingBox(plain.lid).max[0] + 7);
    expect(boundingBox(withBoss.base).max[0]).toBeCloseTo(boundingBox(plain.base).max[0], 1);
  });

  it('a lid-side wall flange braces upward into the lid instead of drooping toward the base', () => {
    const plain = generateMeshes(makeBox({}));
    const withFlange = generateMeshes(
      makeBox({
        features: [
          {
            ...mountBase,
            id: 'lid-flange',
            face: 'right',
            v: 0.9,
            mount: {
              style: 'flange',
              width: 16,
              protrusion: 10,
              thickness: 3,
              hole: 'round',
              holeDiameter: 4.5,
              slotLength: 0,
            },
          },
        ],
      }),
    );
    const plainBb = boundingBox(plain.lid);
    const flangeBb = boundingBox(withFlange.lid);
    expect(flangeBb.min[2]).toBeGreaterThanOrEqual(plainBb.min[2] - 0.5);
    expect(flangeBb.max[2]).toBeGreaterThan(plainBb.max[2] + 1.5);
  });

  it('a top-face flange gets full-width slopes into the lid body rather than a center point', () => {
    const solids = generateSolids(
      makeBox({
        features: [
          {
            ...mountBase,
            id: 'top-flange',
            face: 'top',
            u: 0.5,
            v: 0.5,
            mount: {
              style: 'flange',
              width: 16,
              protrusion: 10,
              thickness: 3,
              hole: 'round',
              holeDiameter: 4.5,
              slotLength: 0,
            },
          },
        ],
      }),
    );
    expect(solidAt(solids.lid, [0, 1.7, 31], 0.5), 'one side of the root ramp').toBe(true);
    expect(solidAt(solids.lid, [0, -1.7, 31], 0.5), 'the other side of the root ramp').toBe(true);
    for (const part of Object.values(solids)) part.delete();
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

  it('the plate cannot be pulled straight out of the assembled case', () => {
    // The whole point of the retaining lip. Sweep the plate outward in small steps: if the case
    // grips it at all, the swept volume has to run into base material. Without a lip the plate is
    // flush with the outer surface and simply falls out sideways -- which is what shipped first.
    const result = generateEnclosure(wasm, makeBox({ panels: PANELS, corner: 'sharp' }), 'export');
    const parts = new Map(result.parts.map((p) => [p.id, p.manifold]));
    let blocked = false;
    for (let d = 0.5; d <= 4; d += 0.5) {
      const moved = parts.get('panel-right')!.translate(d, 0, 0);
      const hit = moved.intersect(parts.get('base')!);
      if (!hit.isEmpty()) blocked = true;
      hit.delete();
      moved.delete();
    }
    for (const part of result.parts) part.manifold.delete();
    expect(blocked, 'the base blocks the plate from sliding out').toBe(true);
  });

  it('...but still lifts straight out of the base, or it could never be assembled', () => {
    // The mirror of the test above: retention must not turn into a trap. The plate goes in from
    // the top before the lid, so nothing in the base may obstruct that path.
    const result = generateEnclosure(wasm, makeBox({ panels: PANELS, corner: 'sharp' }), 'export');
    const parts = new Map(result.parts.map((p) => [p.id, p.manifold]));
    let obstructed = false;
    for (let d = 0.5; d <= 8; d += 0.5) {
      const moved = parts.get('panel-right')!.translate(0, 0, d);
      const hit = moved.intersect(parts.get('base')!);
      if (!hit.isEmpty()) obstructed = true;
      hit.delete();
      moved.delete();
    }
    for (const part of result.parts) part.manifold.delete();
    expect(obstructed, 'nothing in the base is in the way of lifting the plate out').toBe(false);
  });

  it('a plate with the lip switched off is unretained, and says so', () => {
    const result = generateEnclosure(
      wasm,
      makeBox({ panels: { ...PANELS, retainLip: 0 }, corner: 'sharp' }),
      'export',
    );
    const parts = new Map(result.parts.map((p) => [p.id, p.manifold]));
    const moved = parts.get('panel-right')!.translate(3, 0, 0);
    const hit = moved.intersect(parts.get('base')!);
    expect(hit.isEmpty(), 'no lip means nothing holds the plate').toBe(true);
    hit.delete();
    moved.delete();
    for (const part of result.parts) part.manifold.delete();
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

/** Is there material at this world point? Probes a part with a small cube. */
function solidAt(part: Manifold, [x, y, z]: [number, number, number], size = 0.8): boolean {
  const probe = wasm.Manifold.cube([size, size, size], true).translate(x, y, z);
  const hit = part.intersect(probe);
  const empty = hit.isEmpty();
  hit.delete();
  probe.delete();
  return !empty;
}

/** Same as generateParts, but hands back live Manifolds for probing (caller deletes them). */
function generateSolids(project: EnclosureProject): Record<string, Manifold> {
  const result = generateEnclosure(wasm, project, 'export');
  return Object.fromEntries(result.parts.map((p) => [p.id, p.manifold]));
}

describe('fan mounts', () => {
  const fanFeature = (over: Partial<FanMountSpec> = {}, face: Feature['face'] = 'top'): Feature => ({
    id: 'fan',
    type: 'fan-mount',
    face,
    u: 0.5,
    v: 0.5,
    rotationDeg: 0,
    fan: { ...fanSpecFor(40), ...over },
  });

  for (const size of [20, 30, 40, 80]) {
    it(`${size}mm fan keeps both pieces watertight`, () => {
      const { base, lid } = generateMeshes(makeBox({ features: [fanFeature({ ...fanSpecFor(size) })] }));
      expect(isWatertight(base), 'base watertight').toBe(true);
      expect(isWatertight(lid), 'lid watertight').toBe(true);
    });
  }

  for (const grille of ['concentric', 'honeycomb', 'open'] as const) {
    it(`${grille} grille stays watertight, with bosses`, () => {
      const parts = generateParts(makeBox({ features: [fanFeature({ grille, bossHeight: 2.5 })] }));
      for (const [id, mesh] of Object.entries(parts)) {
        expect(isWatertight(mesh), `${id} watertight`).toBe(true);
      }
    });
  }

  it('opens the lid on the ring gaps and keeps the spokes and hub bridges', () => {
    const spec = fanSpecFor(40);
    const solids = generateSolids(makeBox({ features: [fanFeature(spec)] }));
    const z = 30 - 1; // inside the lid's top slab (body height 30)
    // First open ring starts a gap outboard of the hub, measured off the fan's own numbers.
    const firstRingMid = spec.hubDiameter / 2 + spec.ringGap + spec.ringWidth / 2;
    // ...but not along a spoke, so probe at 45 degrees where the 4 spokes (at 0/90) aren't.
    const diag = firstRingMid / Math.SQRT2;
    expect(solidAt(solids.lid, [diag, diag, z], 0.4), 'ring gap is open').toBe(false);
    expect(solidAt(solids.lid, [firstRingMid, 0, z], 0.4), 'spoke is solid').toBe(true);
    expect(solidAt(solids.lid, [0, 0, z], 0.4), 'hub hole is open').toBe(false);
    // The bridge between the first and second ring.
    const bridge = spec.hubDiameter / 2 + spec.ringGap + spec.ringWidth + spec.ringGap / 2;
    expect(solidAt(solids.lid, [bridge / Math.SQRT2, bridge / Math.SQRT2, z], 0.3), 'ring bridge').toBe(true);
    for (const part of Object.values(solids)) part.delete();
  });

  it('bores the screw holes on the fan bolt circle, through the mounting bosses', () => {
    const spec = { ...fanSpecFor(40), bossHeight: 3 };
    const solids = generateSolids(makeBox({ features: [fanFeature(spec)] }));
    const half = spec.holePitch / 2;
    const insideBossZ = 30 - 2 - 1.5; // within the boss, below the lid's inner face
    expect(solidAt(solids.lid, [half, half, 30 - 1], 0.4), 'screw hole is open').toBe(false);
    expect(solidAt(solids.lid, [half, half, insideBossZ], 0.4), 'bored through the boss').toBe(false);
    // The boss itself is material a little to the side of its own bore.
    expect(solidAt(solids.lid, [half + 2, half, insideBossZ], 0.4), 'boss body').toBe(true);
    for (const part of Object.values(solids)) part.delete();
  });
});

describe('corner-anchored external mounts', () => {
  const cornerEar: Feature = {
    id: 'ear',
    type: 'external-mount',
    face: 'front',
    u: 0,
    v: 0.1,
    rotationDeg: 0,
    mount: {
      style: 'flange',
      anchor: 'corner',
      width: 14,
      protrusion: 10,
      thickness: 3,
      hole: 'round',
      holeDiameter: 4.5,
      slotLength: 0,
    },
  };

  it('welds to the corner and reaches out past it on the diagonal', () => {
    const plain = generateMeshes(makeBox({ corner: 'sharp' }));
    const withEar = generateMeshes(makeBox({ corner: 'sharp', features: [cornerEar] }));
    expect(isWatertight(withEar.base), 'base watertight').toBe(true);
    // Front-left corner of an 80x50 box is (-40, -25); the ear runs out along (-1,-1)/sqrt2.
    const bb = boundingBox(withEar.base);
    expect(bb.min[0]).toBeLessThan(boundingBox(plain.base).min[0] - 5);
    expect(bb.min[1]).toBeLessThan(boundingBox(plain.base).min[1] - 5);
  });

  it('stays one solid with a rounded corner, which cuts the corner point away', () => {
    const parts = generateParts(makeBox({ corner: 'rounded', features: [cornerEar] }));
    expect(isWatertight(parts.base), 'base watertight').toBe(true);
    const solids = generateSolids(makeBox({ corner: 'rounded', features: [cornerEar] }));
    // Material on the diagonal just outside the corner arc: the ear bridges the gap the radius
    // opened up, so it is not floating.
    expect(solidAt(solids.base, [-40 + 1, -25 + 1, 3], 0.6)).toBe(true);
    for (const part of Object.values(solids)) part.delete();
  });

  it('connects the ear edges back into both walls on a sharp corner', () => {
    const solids = generateSolids(makeBox({ corner: 'sharp', features: [cornerEar] }));
    expect(solidAt(solids.base, [-40.7, -15.8, 3], 0.6), 'left-wall edge of the ear welds in').toBe(true);
    expect(solidAt(solids.base, [-30.8, -25.7, 3], 0.6), 'front-wall edge of the ear welds in').toBe(true);
    for (const part of Object.values(solids)) part.delete();
  });

  it('attaches to the base even when its face is a slide-in panel', () => {
    const panels: PanelSpec = {
      faces: ['left', 'right'],
      thickness: 2.4,
      fitClearance: 0.2,
      grooveDepth: 1.2,
      captureInLid: true,
    };
    const onPanelFace: Feature = { ...cornerEar, id: 'ear2', face: 'left', u: 0 };
    const parts = generateParts(makeBox({ panels, features: [onPanelFace] }));
    for (const [id, mesh] of Object.entries(parts)) {
      expect(isWatertight(mesh), `${id} watertight`).toBe(true);
    }
    // The plate is unchanged; the ear went onto the base's corner post instead.
    const bare = generateParts(makeBox({ panels }));
    expect(parts['panel-left'].indices.length).toBe(bare['panel-left'].indices.length);
    expect(parts.base.indices.length).toBeGreaterThan(bare.base.indices.length);
  });
});

describe('screw column variations', () => {
  function screwBox(screw: Partial<ScrewSpec>): EnclosureProject {
    const project = makeBox({ lid: 'screw-boss' });
    project.body.lid.screw = { size: 'M3', insertType: 'heat-set', count: 4, ...screw };
    return project;
  }

  it('square columns are watertight and fill their corner more than round ones', () => {
    const square = generateSolids(screwBox({ shape: 'square' }));
    const round = generateSolids(screwBox({ shape: 'round' }));
    expect(square.base.volume()).toBeGreaterThan(round.base.volume());
    for (const part of [...Object.values(square), ...Object.values(round)]) part.delete();
  });

  it('a short column hangs from the seam and leaves the floor under it clear', () => {
    const solids = generateSolids(screwBox({ columnHeight: 8 }));
    const bossRadius = bossRadiusFor({ size: 'M3', insertType: 'heat-set', count: 4 });
    // Boss center for a hanging column: pushed into the corner so it welds to both walls.
    const x = 80 / 2 - 2 - (bossRadius - 0.6);
    const y = 50 / 2 - 2 - (bossRadius - 0.6);
    // Below the 5mm heat-set bore but still inside the 8mm column.
    expect(solidAt(solids.base, [x, y, 24 - 6.5]), 'column material near the seam').toBe(true);
    // Column bottom is 16, and its foot slopes back into the corner over the 8.2mm below that.
    expect(solidAt(solids.base, [x, y, 6]), 'clear below the column and its foot').toBe(false);
    expect(solidAt(solids.base, [x, y, 3]), 'clear down at the floor').toBe(false);
    for (const part of Object.values(solids)) part.delete();
  });

  it('a shortened column gets a sloped foot that stays welded to the wall all the way down', () => {
    const solids = generateSolids(screwBox({ columnHeight: 8 }));
    const bossRadius = bossRadiusFor({ size: 'M3', insertType: 'heat-set', count: 4 });
    const x = 80 / 2 - 2 - (bossRadius - 0.6);
    const y = 50 / 2 - 2 - (bossRadius - 0.6);
    // Column bottom is at 24 - 8 = 16; the foot slopes off it at 45 degrees back into the corner.
    expect(solidAt(solids.base, [x, y, 15], 0.4), 'foot material just under the column').toBe(true);
    expect(solidAt(solids.base, [x, y, 6], 0.4), 'nothing left below the foot').toBe(false);
    // It is a one-sided taper: it keeps its corner (the walls are at x=38, y=23) and gives up the
    // free side, so the slope lands on the wall instead of shrinking to a stub floating off it.
    expect(solidAt(solids.base, [37, 22, 9], 0.4), 'still on the wall near the foot tip').toBe(true);
    expect(solidAt(solids.base, [x - 3, y, 13], 0.4), 'the free side is gone by then').toBe(false);
    for (const part of Object.values(solids)) part.delete();
  });

  it('an exterior column slopes back onto the outside of the wall, not into thin air', () => {
    const solids = generateSolids(screwBox({ placement: 'exterior', columnHeight: 8 }));
    const bossRadius = bossRadiusFor({ size: 'M3', insertType: 'heat-set', count: 4 });
    // Exterior bosses straddle the back wall's outer face (y = 25), overlapping it by 2mm.
    const x = 80 / 2 - bossRadius - 1;
    const y = 50 / 2 + bossRadius - 2;
    expect(solidAt(solids.base, [x, y, 15], 0.4), 'foot material just under the column').toBe(true);
    // Near the bottom of the foot only the strip hugging the wall survives -- that strip is what
    // the taper has to land on. A cone shrinking toward its own axis leaves nothing here.
    expect(solidAt(solids.base, [x, 25.9, 10.5], 0.4), 'foot still touching the wall').toBe(true);
    expect(solidAt(solids.base, [x, y + 2, 11], 0.4), 'outboard side already tapered off').toBe(false);
    expect(solidAt(solids.base, [x, y, 8], 0.4), 'nothing hanging below the foot').toBe(false);
    for (const part of Object.values(solids)) part.delete();
  });

  it('exterior hanging columns keep both pieces watertight', () => {
    const parts = generateParts(screwBox({ placement: 'exterior', columnHeight: 8 }));
    for (const [id, mesh] of Object.entries(parts)) {
      expect(isWatertight(mesh), `${id} watertight`).toBe(true);
    }
  });

  it('a counterbore sinks the head below the lid surface without holing it through', () => {
    const flush = generateSolids(screwBox({}));
    const bored = generateSolids(screwBox({ headStyle: 'counterbore' }));
    const bossRadius = bossRadiusFor({ size: 'M3', insertType: 'heat-set', count: 4 });
    const x = 80 / 2 - 2 - (bossRadius + 1);
    const y = 50 / 2 - 2 - (bossRadius + 1);
    // 2.2mm out from the screw axis: inside the head pocket (M3 head 5.5mm + clearance), but
    // outside the 3.4mm clearance hole that both lids have.
    // The lid's solid top slab is its wall thickness (28..30); with a 2mm wall the pocket can only
    // be 1.2mm deep, so it opens the top of the slab and leaves the rest.
    expect(solidAt(flush.lid, [x + 2.2, y, 29.4], 0.3), 'flush lid is solid there').toBe(true);
    expect(solidAt(bored.lid, [x + 2.2, y, 29.4], 0.3), 'counterbored lid is open there').toBe(false);
    expect(solidAt(bored.lid, [x + 2.2, y, 28.4], 0.3), 'floor of the counterbore').toBe(true);
    for (const part of [...Object.values(flush), ...Object.values(bored)]) part.delete();
  });

  it('M4 is available end to end', () => {
    const parts = generateParts(screwBox({ size: 'M4' }));
    for (const [id, mesh] of Object.entries(parts)) {
      expect(isWatertight(mesh), `${id} watertight`).toBe(true);
    }
  });
});

describe('support pads', () => {
  const pad = (over: Partial<NonNullable<Feature['pad']>> = {}): Feature => ({
    id: 'pad',
    type: 'support-pad',
    face: 'bottom',
    u: 0.75,
    v: 0.5,
    rotationDeg: 0,
    pad: { shape: 'rect', width: 8, depth: 5, height: 6, ...over },
  });

  for (const shape of ['rect', 'round'] as const) {
    it(`${shape} pad keeps both pieces watertight`, () => {
      const { base, lid } = generateMeshes(makeBox({ features: [pad({ shape })] }));
      expect(isWatertight(base), 'base watertight').toBe(true);
      expect(isWatertight(lid), 'lid watertight').toBe(true);
    });
  }

  it('stands on the floor, stops at its height, and has no bore through it', () => {
    const solids = generateSolids(makeBox({ features: [pad()] }));
    // u=0.75 on an 80mm-long floor -> x = 20; wall 2 -> pad spans z 2..8.
    expect(solidAt(solids.base, [20, 0, 3]), 'material at the base of the pad').toBe(true);
    expect(solidAt(solids.base, [20, 0, 7]), 'material at the top of the pad').toBe(true);
    // Solid through the middle: a pad props, it doesn't fasten, so there's no screw hole.
    expect(solidAt(solids.base, [20, 0, 5], 0.4), 'no bore through the pad').toBe(true);
    expect(solidAt(solids.base, [20, 0, 9]), 'nothing above the pad').toBe(false);
    // ...and it's the size it says it is: 8 x 5 means nothing 3mm off-axis along v.
    expect(solidAt(solids.base, [20, 3.6, 5], 0.4), 'clear beyond the pad depth').toBe(false);
    expect(solidAt(solids.base, [23.5, 0, 5], 0.4), 'material within the pad width').toBe(true);
    for (const part of Object.values(solids)) part.delete();
  });

  it('a row emits one pillar per count, spaced by the pitch', () => {
    // u=0.5 on an 80mm floor -> x = 0; three pillars at 12mm pitch land on -12, 0, +12.
    const solids = generateSolids(
      makeBox({ features: [{ ...pad({ count: 3, pitch: 12 }), u: 0.5 }] }),
    );
    for (const x of [-12, 0, 12]) {
      expect(solidAt(solids.base, [x, 0, 5], 0.4), `pillar at x=${x}`).toBe(true);
    }
    for (const x of [-6, 6]) {
      expect(solidAt(solids.base, [x, 0, 5], 0.4), `gap at x=${x}`).toBe(false);
    }
    for (const part of Object.values(solids)) part.delete();
  });

  it('meets the underside of a board sitting on standoffs of the same height', () => {
    const board: Feature = {
      id: 'b',
      type: 'board-mount',
      face: 'bottom',
      u: 0.5,
      v: 0.5,
      rotationDeg: 0,
      board: {
        boardWidth: 50,
        boardDepth: 40,
        boardThickness: 1.6,
        holes: [{ x: -21.5, y: -16.5 }, { x: 21.5, y: 16.5 }],
        standoff: { outerDiameter: 6, screwHoleDiameter: 2.2, height: 4 },
      },
    };
    const solids = generateSolids(makeBox({ features: [board, pad({ height: 4 })] }));
    // Board underside sits at wallThickness + standoff height = 6; the pad tops out there too.
    expect(solidAt(solids.base, [20, 0, 5.5], 0.4), 'pad material just under the board').toBe(true);
    expect(solidAt(solids.base, [20, 0, 6.6], 0.4), 'nothing where the board itself is').toBe(false);
    for (const part of Object.values(solids)) part.delete();
  });
});
