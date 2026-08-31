import type { EnclosureBody } from '../types/project';
import { minimumSlideRailSplitHeight } from './slideRailMetrics';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** The valid seam range shared by CSG and direct manipulation. A slide rail reserves room below
 * the seam for its capture hooks instead of allowing them to collapse into the floor. */
export function lidSplitRange(body: EnclosureBody): { min: number; max: number } {
  const wallThickness = Math.max(body.wallThickness, 0.4);
  const outerH = body.shape === 'wedge' ? body.outer.heightBack : body.outer.height;
  const genericMin = wallThickness + 1;
  const max = Math.max(genericMin, outerH - wallThickness - 1);
  const slideMin = minimumSlideRailSplitHeight(wallThickness, body.lid.wallGap);
  return {
    min: body.lid.type === 'slide-rail' ? Math.min(Math.max(genericMin, slideMin), max) : genericMin,
    max,
  };
}

/** The split height the CSG pipeline actually uses. Shared between generateEnclosure and the
 * viewport so direct manipulation cannot drift from generated geometry. */
export function effectiveSplitHeight(body: EnclosureBody): number {
  const { min, max } = lidSplitRange(body);
  return clamp(body.lid.splitHeight, min, max);
}

// Which piece a given feature lands on used to live here as featureOnLid(); it moved to
// csg/parts.ts as featurePart() when slide-in panels made "base or lid" too few answers.
