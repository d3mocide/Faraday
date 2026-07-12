import type { EnclosureBody, Feature } from '../types/project';
import { bodyGeometry, faceFrame } from './faceFrame';

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

/** Which half of the split a feature lands on — the rule generateEnclosure uses to pick its
 * boolean target: 'top' is always the lid, 'bottom' (and standoffs, which always mount to the
 * base floor) always the base, and side-wall features by their world-space height. */
export function featureOnLid(
  feature: Pick<Feature, 'type' | 'face' | 'u' | 'v'>,
  body: EnclosureBody,
): boolean {
  if (feature.type === 'standoff' || feature.type === 'board-mount') return false;
  if (feature.face === 'top') return true;
  if (feature.face === 'bottom') return false;
  const z = faceFrame(feature.face, bodyGeometry(body)).toWorld(feature.u, feature.v)[2];
  return z > effectiveSplitHeight(body);
}
