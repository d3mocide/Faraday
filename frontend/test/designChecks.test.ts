import { describe, it, expect } from 'vitest';
import { runDesignChecks } from '../src/state/designChecks';
import { planOverhangSupport } from '../src/state/boardSupport';
import { supportPadPositions } from '../src/csg/faceFrame';
import { WAVESHARE_CM4_DUAL_ETH_MOUNT } from '../src/presets/boardMounts';
import type { BoardMountSpec, EnclosureProject, Feature } from '../src/types/project';

const NOW = '2026-01-01T00:00:00.000Z';

/** 100 x 80 box, so the floor's mm <-> (u,v) conversion is easy to reason about. */
function project(features: Feature[]): EnclosureProject {
  return {
    id: 't',
    name: 't',
    units: 'mm',
    createdAt: NOW,
    updatedAt: NOW,
    body: {
      shape: 'box',
      outer: { length: 100, width: 80, height: 30 },
      wallThickness: 2,
      cornerStyle: { type: 'rounded', radius: 3 },
      lid: { type: 'screw-boss', splitHeight: 24, wallGap: 0.2, screw: { size: 'M3', insertType: 'heat-set', count: 4 } },
    },
    features,
  };
}

const BOARD_SPEC: BoardMountSpec = {
  boardWidth: 50,
  boardDepth: 40,
  boardThickness: 1.6,
  holes: [
    { x: -21, y: -16 },
    { x: -21, y: 16 },
  ],
  standoff: { outerDiameter: 6, screwHoleDiameter: 2.2, height: 4 },
};

/** Centred board-mount on the floor. */
const board: Feature = {
  id: 'board',
  type: 'board-mount',
  face: 'bottom',
  u: 0.5,
  v: 0.5,
  rotationDeg: 0,
  board: BOARD_SPEC,
};

/** A pad at (x, y) mm from the centre of the 100 x 80 floor. */
function padAt(x: number, y: number, over: Partial<NonNullable<Feature['pad']>> = {}): Feature {
  return {
    id: `pad-${x}-${y}`,
    type: 'support-pad',
    face: 'bottom',
    u: x / 100 + 0.5,
    v: y / 80 + 0.5,
    rotationDeg: 0,
    pad: { shape: 'rect', width: 6, depth: 5, height: 4, ...over },
  };
}

describe('support pad rows', () => {
  const geom = { shape: 'box', length: 100, width: 80, height: 30 } as const;

  it('a plain pad is a single pillar at its own position', () => {
    const [[x, y]] = supportPadPositions(padAt(10, 5), geom);
    expect(x).toBeCloseTo(10, 6);
    expect(y).toBeCloseTo(5, 6);
  });

  it('a row is centred on the feature and spaced by the pitch', () => {
    const positions = supportPadPositions(padAt(0, 0, { count: 3, pitch: 10 }), geom);
    expect(positions.map(([x]) => Math.round(x))).toEqual([-10, 0, 10]);
    for (const [, y] of positions) expect(y).toBeCloseTo(0, 6);
  });

  it('the row axis and the feature rotation turn the whole arrangement together', () => {
    const alongV = supportPadPositions(padAt(0, 0, { count: 2, pitch: 10, axis: 'v' }), geom);
    expect(alongV[0][0]).toBeCloseTo(0, 6);
    expect(alongV[0][1]).toBeCloseTo(-5, 6);
    expect(alongV[1][1]).toBeCloseTo(5, 6);

    const feature = { ...padAt(0, 0, { count: 2, pitch: 10, axis: 'v' }), rotationDeg: 90 };
    const turned = supportPadPositions(feature, geom);
    // Rotating 90 degrees swings a v-axis row onto the u axis.
    expect(turned[0][0]).toBeCloseTo(5, 6);
    expect(turned[0][1]).toBeCloseTo(0, 6);
  });

  it('a pitch of zero collapses to one pillar rather than stacking them', () => {
    expect(supportPadPositions(padAt(0, 0, { count: 4, pitch: 0 }), geom)).toHaveLength(1);
  });
});

describe('design checks stay quiet when they cannot know', () => {
  it('says nothing about a pad when the project has no board at all', () => {
    expect(runDesignChecks(project([padAt(30, 30)]))).toEqual([]);
  });

  it('says nothing about a correct pad', () => {
    expect(runDesignChecks(project([board, padAt(20, 0)]))).toEqual([]);
  });

  it('ignores hidden features on both sides', () => {
    expect(runDesignChecks(project([board, { ...padAt(45, 0), hidden: true }]))).toEqual([]);
    expect(runDesignChecks(project([{ ...board, hidden: true }, padAt(45, 0)]))).toEqual([]);
  });
});

describe('design checks catch the real mistakes', () => {
  it('flags a pad that is nowhere near a board', () => {
    const findings = runDesignChecks(project([board, padAt(45, 35)]));
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toMatch(/not under a board/);
  });

  it('counts how many pads of a row missed', () => {
    // Board spans x -25..25; a row centred at x=20 with 20mm pitch puts one pillar outside.
    const findings = runDesignChecks(project([board, padAt(20, 0, { count: 2, pitch: 20 })]));
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('1 of 2 pads in this row are not under a board');
  });

  it('flags a pad that would lift the board off its standoffs', () => {
    const findings = runDesignChecks(project([board, padAt(20, 0, { height: 6 })]));
    expect(findings.map((f) => f.title)).toEqual(['Support pad is 2.0mm taller than the board\'s standoffs']);
  });

  it('flags a pad that falls short of the board', () => {
    const findings = runDesignChecks(project([board, padAt(20, 0, { height: 2.5 })]));
    expect(findings[0].title).toMatch(/1\.5mm short/);
  });

  it('flags a pad sitting on top of a standoff', () => {
    // A hole at board-local (-21, 16) is at world (-21, 16) for a centred board.
    const findings = runDesignChecks(project([board, padAt(-21, 16)]));
    expect(findings.map((f) => f.title)).toContain('Support pad overlaps a standoff');
  });

  it('respects a rotated board when deciding what is underneath it', () => {
    const turned = { ...board, rotationDeg: 90 };
    // (0, 22) is outside the unrotated 50x40 board, but inside it once turned 90 degrees.
    expect(runDesignChecks(project([turned, padAt(0, 22)]))).toEqual([]);
    expect(runDesignChecks(project([board, padAt(0, 22)]))[0].title).toMatch(/not under a board/);
  });
});

describe('overhang support planner', () => {
  const body = project([]).body;

  it('finds the cantilevered edge and props it', () => {
    const plan = planOverhangSupport(BOARD_SPEC, { u: 0.5, v: 0.5, rotationDeg: 0 }, body);
    expect(plan).not.toBeNull();
    // Holes are all at x = -21, so the +x edge is the one hanging over air.
    expect(plan!.edge).toBe('right');
    expect(plan!.unsupportedMm).toBeCloseTo(46, 1);
    expect(plan!.feature.pad!.height).toBe(BOARD_SPEC.standoff.height);
    expect(plan!.feature.pad!.count).toBeGreaterThan(1);
  });

  it('puts every pad of the plan under the board, and the plan itself passes the checks', () => {
    const plan = planOverhangSupport(BOARD_SPEC, { u: 0.5, v: 0.5, rotationDeg: 0 }, body)!;
    expect(runDesignChecks(project([board, plan.feature]))).toEqual([]);
  });

  it('declines when every edge is close to a hole', () => {
    const cornered: BoardMountSpec = {
      ...BOARD_SPEC,
      holes: [
        { x: -21, y: -16 },
        { x: 21, y: -16 },
        { x: -21, y: 16 },
        { x: 21, y: 16 },
      ],
    };
    expect(planOverhangSupport(cornered, { u: 0.5, v: 0.5, rotationDeg: 0 }, body)).toBeNull();
  });

  it('lands on the same edge inset the CM4 design chose by hand', () => {
    // The contributed design put its pads at x = 41.765 for a 91.53mm-wide board (4mm in from the
    // edge). The planner derives the same inset from the pad width.
    const plan = planOverhangSupport(
      WAVESHARE_CM4_DUAL_ETH_MOUNT,
      { u: 0.5, v: 0.5, rotationDeg: 0 },
      { ...body, outer: { length: 97.4, width: 114.8, height: 45.5 } },
    )!;
    expect(plan.edge).toBe('right');
    const x = plan.feature.u * 97.4 - 97.4 / 2;
    expect(x).toBeCloseTo(41.765, 2);
  });
});

describe('panel retention check', () => {
  function withPanels(thickness: number, retainLip?: number): EnclosureProject {
    const p = project([]);
    if (p.body.shape === 'box') {
      p.body.panels = {
        faces: ['left', 'right'],
        thickness,
        fitClearance: 0.2,
        grooveDepth: 1.2,
        captureInLid: true,
        retainLip,
      };
    }
    return p;
  }

  it('says nothing about a plate thick enough to keep its lip', () => {
    expect(runDesignChecks(withPanels(2.4))).toEqual([]);
  });

  it('flags a plate too thin to be retained at all', () => {
    const findings = runDesignChecks(withPanels(1));
    expect(findings.map((f) => f.title)).toEqual(['Slide-in plates are too thin to be retained']);
    expect(findings[0].featureId).toBeUndefined();
  });

  it('stays quiet when the lip was deliberately turned off', () => {
    expect(runDesignChecks(withPanels(1, 0))).toEqual([]);
    expect(runDesignChecks(withPanels(2.4, 0))).toEqual([]);
  });
});
