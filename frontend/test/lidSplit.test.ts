import { describe, expect, it } from 'vitest';
import { effectiveSplitHeight, lidSplitRange } from '../src/csg/lidSplit';
import { resolveSlideRailMetrics } from '../src/csg/slideRailMetrics';
import type { EnclosureBody } from '../src/types/project';

function boxBody(lidType: EnclosureBody['lid']['type'], splitHeight: number): EnclosureBody {
  return {
    shape: 'box',
    outer: { length: 80, width: 50, height: 22 },
    wallThickness: 2,
    cornerStyle: { type: 'rounded', radius: 3 },
    lid: { type: lidType, splitHeight, wallGap: 0.2 },
  };
}

describe('captive slide rail seam metrics', () => {
  it('reports the visible cover envelope below the nominal seam', () => {
    const rail = resolveSlideRailMetrics({ splitHeight: 19, wallThickness: 2, wallGap: 0.2 });
    expect(rail.coverOverlap).toBeCloseTo(2.6, 5);
    expect(rail.railBottom).toBeCloseTo(16.4, 5);
  });

  it('reserves enough base height for the rail capture before clamping the requested seam', () => {
    const slide = boxBody('slide-rail', 3);
    const plain = boxBody('friction-lip', 3);
    const slideRange = lidSplitRange(slide);
    expect(slideRange.min).toBeCloseTo(5.6, 5);
    expect(effectiveSplitHeight(slide)).toBe(slideRange.min);
    expect(lidSplitRange(plain).min).toBe(3);
  });
});
