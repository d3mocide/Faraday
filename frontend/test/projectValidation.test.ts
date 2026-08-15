import { describe, it, expect } from 'vitest';
import { isValidEnclosureProject } from '../src/state/projectValidation';
import type { EnclosureBody } from '../src/types/project';

const NOW = '2026-01-01T00:00:00.000Z';

function baseProject(body: EnclosureBody) {
  return {
    id: 'p1',
    name: 'test',
    units: 'mm' as const,
    createdAt: NOW,
    updatedAt: NOW,
    body,
    features: [],
  };
}

const lid = { type: 'friction-lip' as const, splitHeight: 12, wallGap: 0.2 };

// One minimal-but-valid body per shape -- this is the regression test for the 2026-08-15 bug where
// isValidEnclosureProject only recognized 'box'/'cylinder', so autosave restore and file Load
// silently discarded every hexagon/octagon/stadium/wedge project and fell back to a default box.
const VALID_BODIES: Array<[string, EnclosureBody]> = [
  ['box', { shape: 'box', outer: { length: 80, width: 50, height: 30 }, wallThickness: 2, cornerStyle: { type: 'rounded', radius: 3 }, lid }],
  ['cylinder', { shape: 'cylinder', outer: { diameter: 60, height: 40 }, wallThickness: 2, lid }],
  ['hexagon', { shape: 'hexagon', outer: { radius: 35, height: 30 }, wallThickness: 2, lid }],
  ['octagon', { shape: 'octagon', outer: { radius: 35, height: 30 }, wallThickness: 2, lid }],
  ['stadium', { shape: 'stadium', outer: { length: 80, width: 45, height: 30 }, wallThickness: 2, cornerStyle: { type: 'rounded', radius: 3 }, lid }],
  ['wedge', { shape: 'wedge', outer: { length: 80, width: 50, heightFront: 15, heightBack: 35 }, wallThickness: 2, cornerStyle: { type: 'rounded', radius: 3 }, lid }],
];

describe('isValidEnclosureProject: every body shape round-trips', () => {
  for (const [name, body] of VALID_BODIES) {
    it(`accepts a well-formed ${name} project`, () => {
      expect(isValidEnclosureProject(baseProject(body))).toBe(true);
    });
  }
});

describe('isValidEnclosureProject: rejects malformed data per shape', () => {
  it('rejects an unknown shape string', () => {
    const p = baseProject(VALID_BODIES[0][1]);
    p.body = { ...p.body, shape: 'nonagon' } as unknown as EnclosureBody;
    expect(isValidEnclosureProject(p)).toBe(false);
  });

  it('rejects hexagon/octagon missing radius', () => {
    const p = baseProject({ shape: 'hexagon', outer: { radius: 35, height: 30 }, wallThickness: 2, lid });
    const body = p.body as Record<string, unknown>;
    const outer = { ...(body.outer as object) } as Record<string, unknown>;
    delete outer.radius;
    expect(isValidEnclosureProject({ ...p, body: { ...body, outer } })).toBe(false);
  });

  it('rejects stadium missing cornerStyle', () => {
    const p = baseProject(VALID_BODIES[4][1]);
    const body = { ...(p.body as object) } as Record<string, unknown>;
    delete body.cornerStyle;
    expect(isValidEnclosureProject({ ...p, body })).toBe(false);
  });

  it('rejects wedge missing heightFront/heightBack', () => {
    const p = baseProject(VALID_BODIES[5][1]);
    const body = p.body as Record<string, unknown>;
    const outer = { length: 80, width: 50 }; // no heightFront/heightBack
    expect(isValidEnclosureProject({ ...p, body: { ...body, outer } })).toBe(false);
  });

  it('rejects box missing cornerStyle', () => {
    const p = baseProject(VALID_BODIES[0][1]);
    const body = { ...(p.body as object) } as Record<string, unknown>;
    delete body.cornerStyle;
    expect(isValidEnclosureProject({ ...p, body })).toBe(false);
  });

  it('rejects cylinder missing diameter', () => {
    const p = baseProject(VALID_BODIES[1][1]);
    const body = p.body as Record<string, unknown>;
    expect(isValidEnclosureProject({ ...p, body: { ...body, outer: { height: 40 } } })).toBe(false);
  });

  it('rejects a non-object payload', () => {
    expect(isValidEnclosureProject(null)).toBe(false);
    expect(isValidEnclosureProject('a hexagon project')).toBe(false);
    expect(isValidEnclosureProject(42)).toBe(false);
  });

  it('rejects a project with no body at all', () => {
    const p = baseProject(VALID_BODIES[0][1]) as Record<string, unknown>;
    delete p.body;
    expect(isValidEnclosureProject(p)).toBe(false);
  });
});
