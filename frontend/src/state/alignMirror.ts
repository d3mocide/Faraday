import type { Feature } from '../types/project';

export type Axis = 'u' | 'v';
export type AxisTarget = 0 | 0.5 | 1;

/** Where a feature would land after snapping the given axis to a target (0/0.5/1 = face
 * start/center/end) -- also used to compute the hover-preview position before committing. */
export function alignedPosition(feature: Feature, axis: Axis, target: AxisTarget): Pick<Feature, 'u' | 'v'> {
  return axis === 'u' ? { u: target, v: feature.v } : { u: feature.u, v: target };
}

/** Where a mirrored duplicate would land: the given axis reflected across the face's own center
 * (0.5). Null if the feature is already centered on that axis -- mirroring would just stack an
 * identical duplicate exactly on top of the original, which isn't a useful action to offer. */
export function mirroredPosition(feature: Feature, axis: Axis): Pick<Feature, 'u' | 'v'> | null {
  const value = axis === 'u' ? feature.u : feature.v;
  const mirrored = 1 - value;
  if (Math.abs(mirrored - value) < 1e-6) return null;
  return axis === 'u' ? { u: mirrored, v: feature.v } : { u: feature.u, v: mirrored };
}

/** A deep-cloned copy of `feature` (new id, nested specs like standoff/board/vent copied rather
 * than shared) at `position` -- used to place a mirrored duplicate via the store's addFeature. */
export function cloneFeatureAt(feature: Feature, position: Pick<Feature, 'u' | 'v'>): Feature {
  return { ...structuredClone(feature), ...position, id: crypto.randomUUID() };
}
