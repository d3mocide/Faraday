import type { EnclosureBody } from '../types/project';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** The split height the CSG pipeline actually uses: the requested lid.splitHeight clamped so both
 * halves keep at least a wall's worth of material. Shared between generateEnclosure (worker-side)
 * and Viewport3D (main-thread side) so view logic can't drift from the geometry. */
export function effectiveSplitHeight(body: EnclosureBody): number {
  const wallThickness = Math.max(body.wallThickness, 0.4);
  return clamp(body.lid.splitHeight, wallThickness + 1, body.outer.height - wallThickness - 1);
}

// Which piece a given feature lands on used to live here as featureOnLid(); it moved to
// csg/parts.ts as featurePart() when slide-in panels made "base or lid" too few answers.
