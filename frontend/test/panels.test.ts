import { describe, it, expect, beforeAll } from 'vitest';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { generateEnclosure } from '../src/csg/generateEnclosure';
import { extractMeshData } from '../src/csg/manifoldToGeometry';
import { panelMetrics } from '../src/csg/parts';
import { MIN_SKIN } from '../src/csg/printRules';
import type {
  CornerStyleType,
  EnclosureProject,
  PanelScrewSpec,
  PanelSpec,
} from '../src/types/project';
import { runDesignChecks } from '../src/state/designChecks';
import { getTestWasm } from './helpers/wasm';
import { isWatertight } from './helpers/geometry';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await getTestWasm();
});

const NOW = '2026-01-01T00:00:00.000Z';
const LENGTH = 80;
const WIDTH = 50;
const HEIGHT = 30;
const WALL = 3;
const SPLIT = 24;

const PANELS: PanelSpec = {
  faces: ['left', 'right'],
  thickness: 3,
  fitClearance: 0.2,
  grooveDepth: 1.2,
  captureInLid: true,
};

function makeBox(over: {
  corner?: CornerStyleType;
  radius?: number;
  panels?: PanelSpec;
} = {}): EnclosureProject {
  return {
    id: 'test',
    name: 'test',
    units: 'mm',
    createdAt: NOW,
    updatedAt: NOW,
    body: {
      shape: 'box',
      outer: { length: LENGTH, width: WIDTH, height: HEIGHT },
      wallThickness: WALL,
      cornerStyle: { type: over.corner ?? 'rounded', radius: over.radius ?? 5 },
      lid: { type: 'friction-lip', splitHeight: SPLIT, wallGap: 0.2 },
      panels: over.panels ?? PANELS,
    },
    features: [],
  };
}

/** Every part, as live Manifolds. Caller deletes. */
function parts(project: EnclosureProject): Map<string, Manifold> {
  const result = generateEnclosure(wasm, project, 'export');
  return new Map(result.parts.map((p) => [p.id, p.manifold]));
}

function free(map: Map<string, Manifold>): void {
  for (const m of map.values()) m.delete();
}

function box(
  x: [number, number],
  y: [number, number],
  z: [number, number],
): Manifold {
  return wasm.Manifold.cube([x[1] - x[0], y[1] - y[0], z[1] - z[0]], false).translate(x[0], y[0], z[0]);
}

/**
 * How much material the case actually leaves outboard of the channel at its outermost point --
 * the retaining lip, measured where it is thinnest.
 *
 * The probe sits in a thin band of Y just inside the groove's outer edge -- past the channel's own
 * inner face in X, so the only base material it can contain is the lip itself, and clear of the
 * groove's boundary plane so a coincident face can't be read as material. Its X extent is
 * therefore the lip's thickness. This is the measurement that was 0.40mm on the first
 * printed Waveshare case, against a nominal 1.0mm.
 */
function lipThickness(base: Manifold, project: EnclosureProject): number {
  const metrics = panelMetrics(project.body)!;
  const outer = LENGTH / 2;
  const acrossHalf = WIDTH / 2;
  const bound = acrossHalf - WALL + metrics.grooveDepth;
  const probe = box(
    [outer - metrics.thickness - metrics.clearance + 0.01, outer + 1],
    [bound - 0.2, bound - 0.05],
    [metrics.plateBottomZ + 2, metrics.plateBottomZ + 3],
  );
  const hit = base.intersect(probe);
  const empty = hit.isEmpty();
  const bb = hit.boundingBox();
  const thickness = empty ? 0 : bb.max[0] - bb.min[0];
  hit.delete();
  probe.delete();
  return thickness;
}

/** Does the case actually stop the plate being pulled straight out of its own face? */
function retained(map: Map<string, Manifold>): boolean {
  const plate = map.get('panel-right')!;
  for (let d = 0.5; d <= 4; d += 0.5) {
    const moved = plate.translate(d, 0, 0);
    const hit = moved.intersect(map.get('base')!);
    const blocked = !hit.isEmpty();
    hit.delete();
    moved.delete();
    if (blocked) return true;
  }
  return false;
}

describe('panel retaining lip vs. the body corner', () => {
  // The invariant this whole change exists to enforce: retention is all or nothing. Either the lip
  // is there at its full nominal thickness, or the case admits it has no grip and says so -- never
  // the in-between the first Waveshare print produced, where a lip the generator believed was 1.0mm
  // had been shaved to 0.40mm by the corner arc and snapped.
  for (const corner of ['sharp', 'rounded', 'chamfered'] as CornerStyleType[]) {
    it(`grips at full thickness or not at all on a ${corner} corner`, () => {
      const project = makeBox({ corner });
      const metrics = panelMetrics(project.body)!;
      const map = parts(project);
      const holds = retained(map);
      const measured = lipThickness(map.get('base')!, project);
      free(map);

      if (holds) {
        // At least nominal. Around a curve it measures a little *more* than `retainLip`, because
        // the shell is offset along its own normal and the probe reads the thickness along X.
        expect(measured, `${corner} lip`).toBeGreaterThanOrEqual(MIN_SKIN - 0.05);
        expect(measured, `${corner} lip`).toBeGreaterThanOrEqual(metrics.retainLip - 0.05);
      } else {
        expect(
          runDesignChecks(project).some((f) => f.id === 'panels:corner-eats-lip'),
          `${corner} reports its lack of grip`,
        ).toBe(true);
      }
    });
  }

  it('grips on the corner styles that leave room, and reports the one that does not', () => {
    for (const corner of ['sharp', 'rounded'] as CornerStyleType[]) {
      const metrics = panelMetrics(makeBox({ corner }).body)!;
      expect(metrics.cornerLipRoom, corner).toBeGreaterThanOrEqual(metrics.retainLip);
    }
    // A 5mm chamfer on a 3mm wall: the outer surface has already cut past the channel by the time
    // it reaches the groove, so there is nowhere for a lip to be at all.
    expect(panelMetrics(makeBox({ corner: 'chamfered' }).body)!.cornerLipRoom).toBeLessThan(MIN_SKIN);
  });

  it('never leaves less than MIN_SKIN of wall outboard of the groove', () => {
    // A 1.2mm groove in a 2mm wall would leave 0.8mm; the clamp pulls it back to 0.8mm of groove.
    const project = makeBox();
    (project.body as { wallThickness: number }).wallThickness = 2;
    const metrics = panelMetrics(project.body)!;
    expect(metrics.grooveDepth).toBeCloseTo(2 - MIN_SKIN, 5);
  });

  it('leaves the plate ear at least MIN_SKIN thick', () => {
    const metrics = panelMetrics(makeBox().body)!;
    const ear = metrics.thickness - metrics.retainLip - metrics.clearance / 2;
    expect(ear).toBeGreaterThanOrEqual(MIN_SKIN - 1e-6);
  });
});

describe('screwed slide-in panels', () => {
  const SCREW: PanelScrewSpec = {
    size: 'M2',
    insertType: 'self-tap',
    countPerEnd: 2,
    headStyle: 'counterbore',
    postWidth: 6,
    postDepth: 6,
  };
  const screwed = () => makeBox({ panels: { ...PANELS, screw: SCREW } });

  it('keeps every part watertight', () => {
    const map = parts(screwed());
    for (const [id, m] of map) {
      expect(isWatertight(extractMeshData(m)), `${id} watertight`).toBe(true);
    }
    free(map);
  });

  it('puts a post in the interior corner behind each end of the plate', () => {
    const plain = parts(makeBox());
    const withScrews = parts(screwed());
    const metrics = panelMetrics(screwed().body)!;

    // Where the post stands: behind the right plate, inboard of the back wall's inner face.
    const cavityEdge = WIDTH / 2 - WALL;
    const front = LENGTH / 2 - metrics.thickness - metrics.clearance / 2;
    const probe = box(
      [front - 2, front - 0.5],
      [cavityEdge - 4, cavityEdge - 1],
      [SPLIT / 2, SPLIT / 2 + 1],
    );
    const before = plain.get('base')!.intersect(probe);
    const after = withScrews.get('base')!.intersect(probe);
    expect(before.isEmpty(), 'no post without screws').toBe(true);
    expect(after.isEmpty(), 'post present with screws').toBe(false);

    before.delete();
    after.delete();
    probe.delete();
    free(plain);
    free(withScrews);
  });

  it('bores the post and drills the plate on the same axis', () => {
    const map = parts(screwed());
    const metrics = panelMetrics(screwed().body)!;
    const screw = metrics.screw!;
    const cavityEdge = WIDTH / 2 - WALL;
    const across = cavityEdge - screw.centerInset;
    const z = screw.zPositions[0];

    // A rod on the screw's own axis, from outside the case into the post, must pass through both
    // pieces without meeting material -- that is the definition of a screw fitting.
    // The rod runs from outside the case to just short of the bore's blind end.
    const tip = LENGTH / 2 - metrics.thickness - metrics.clearance / 2 - screw.boreDepth + 0.2;
    const rod = wasm.Manifold.cylinder(
      LENGTH / 2 + 1 - tip,
      screw.boreDiameter / 2 - 0.05,
      screw.boreDiameter / 2 - 0.05,
      0,
      false,
    )
      .rotate(0, 90, 0)
      .translate(tip, across, z);
    for (const id of ['base', 'panel-right']) {
      const clash = rod.intersect(map.get(id)!);
      expect(clash.isEmpty(), `${id} is clear on the screw axis`).toBe(true);
      clash.delete();
    }
    rod.delete();
    free(map);
  });

  it('still lets the plate lift straight out, so it can be assembled', () => {
    const map = parts(screwed());
    const plate = map.get('panel-right')!;
    let obstructed = false;
    for (let d = 0.5; d <= 8; d += 0.5) {
      const moved = plate.translate(0, 0, d);
      const hit = moved.intersect(map.get('base')!);
      if (!hit.isEmpty()) obstructed = true;
      hit.delete();
      moved.delete();
    }
    expect(obstructed, 'nothing blocks the plate from lifting out').toBe(false);
    free(map);
  });

  it('sinks the head so it does not stand proud of the case', () => {
    const metrics = panelMetrics(screwed().body)!;
    expect(metrics.screw!.counterboreDepth).toBeGreaterThan(0);
    expect(metrics.screw!.counterboreDepth).toBeLessThanOrEqual(metrics.thickness - MIN_SKIN);
  });
});
