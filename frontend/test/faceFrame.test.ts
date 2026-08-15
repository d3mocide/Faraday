import { describe, it, expect } from 'vitest';
import {
  bodyGeometry,
  clamp01,
  closestFace,
  facesForShape,
  faceFrame,
  faceFromWorld,
  faceLabel,
  type BodyGeometry,
} from '../src/csg/faceFrame';
import type { EnclosureBody } from '../src/types/project';

const BODIES: Array<[string, EnclosureBody]> = [
  ['box', { shape: 'box', outer: { length: 80, width: 50, height: 30 }, wallThickness: 2, cornerStyle: { type: 'rounded', radius: 3 }, lid: { type: 'friction-lip', splitHeight: 12, wallGap: 0.2 } }],
  ['cylinder', { shape: 'cylinder', outer: { diameter: 60, height: 40 }, wallThickness: 2, lid: { type: 'friction-lip', splitHeight: 12, wallGap: 0.2 } }],
  ['hexagon', { shape: 'hexagon', outer: { radius: 35, height: 30 }, wallThickness: 2, lid: { type: 'friction-lip', splitHeight: 12, wallGap: 0.2 } }],
  ['octagon', { shape: 'octagon', outer: { radius: 35, height: 30 }, wallThickness: 2, lid: { type: 'friction-lip', splitHeight: 12, wallGap: 0.2 } }],
  ['stadium', { shape: 'stadium', outer: { length: 80, width: 45, height: 30 }, wallThickness: 2, cornerStyle: { type: 'rounded', radius: 3 }, lid: { type: 'friction-lip', splitHeight: 12, wallGap: 0.2 } }],
  ['wedge', { shape: 'wedge', outer: { length: 80, width: 50, heightFront: 15, heightBack: 35 }, wallThickness: 2, cornerStyle: { type: 'rounded', radius: 3 }, lid: { type: 'friction-lip', splitHeight: 12, wallGap: 0.2 } }],
];

// Samples away from exact edges/corners, where two faces' normals can tie and the round-trip is
// legitimately ambiguous (e.g. a box corner where front/right/top all meet).
const SAMPLES: Array<[number, number]> = [
  [0.3, 0.3],
  [0.5, 0.5],
  [0.7, 0.4],
  [0.2, 0.8],
];

describe('faceFrame: toWorld / faceFromWorld round-trip for every shape and face', () => {
  for (const [shapeName, body] of BODIES) {
    const geom = bodyGeometry(body);
    for (const face of facesForShape(geom.shape)) {
      it(`${shapeName}/${face}: faceFromWorld(toWorld(u,v)) ~= (u,v)`, () => {
        const frame = faceFrame(face, geom);
        for (const [u, v] of SAMPLES) {
          const world = frame.toWorld(u, v);
          const [u2, v2] = faceFromWorld(face, geom, world);
          expect(u2, `${shapeName}/${face} u at (${u},${v})`).toBeCloseTo(u, 5);
          expect(v2, `${shapeName}/${face} v at (${u},${v})`).toBeCloseTo(v, 5);
        }
      });
    }
  }
});

describe('faceFrame: closestFace(normalAt(u,v)) resolves back to the same face', () => {
  for (const [shapeName, body] of BODIES) {
    const geom = bodyGeometry(body);
    for (const face of facesForShape(geom.shape)) {
      it(`${shapeName}/${face}: closestFace(normalAt(u,v)) === face`, () => {
        const frame = faceFrame(face, geom);
        for (const [u, v] of SAMPLES) {
          const normal = frame.normalAt(u, v);
          expect(closestFace(normal, geom), `${shapeName}/${face} at (${u},${v})`).toBe(face);
        }
      });
    }
  }
});

describe('facesForShape', () => {
  it('every shape includes bottom, excludes faces it does not have', () => {
    const cases: Array<[BodyGeometry['shape'], number]> = [
      ['box', 6],
      ['cylinder', 3],
      ['hexagon', 8], // bottom + 6 facets + top
      ['octagon', 10], // bottom + 8 facets + top
      ['stadium', 6],
      ['wedge', 6], // bottom + front + back + left + right + slanted-top, no 'top'
    ];
    for (const [shape, count] of cases) {
      const faces = facesForShape(shape);
      expect(faces).toContain('bottom');
      expect(faces.length).toBe(count);
    }
    expect(facesForShape('wedge')).not.toContain('top');
    expect(facesForShape('cylinder')).not.toContain('front');
  });

  it('faceLabel is defined for every face facesForShape can produce', () => {
    for (const shape of ['box', 'cylinder', 'hexagon', 'octagon', 'stadium', 'wedge'] as const) {
      for (const face of facesForShape(shape)) {
        expect(faceLabel(face).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('clamp01', () => {
  it('clamps into [0,1]', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });
});
