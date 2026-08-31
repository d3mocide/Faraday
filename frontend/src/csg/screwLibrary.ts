import { FASTENER_RECIPES, type FastenerDimensions } from '../fasteners/library';
import type { ScrewSize } from '../types/project';

/**
 * Starter/approximate hole dimensions for common miniature machine screws used
 * in 3D-printed enclosures. Not guaranteed specs for any specific screw or
 * insert brand -- verify against your actual hardware before a real print,
 * same disclaimer as the connector library.
 */
export type ScrewHoleSpec = FastenerDimensions;

export const SCREW_HOLE_SPECS: Record<ScrewSize, ScrewHoleSpec> = {
  M2: FASTENER_RECIPES.find((recipe) => recipe.id === 'starter-m2-heat-set')!.dimensions,
  'M2.5': FASTENER_RECIPES.find((recipe) => recipe.id === 'starter-m2.5-heat-set')!.dimensions,
  M3: FASTENER_RECIPES.find((recipe) => recipe.id === 'starter-m3-heat-set')!.dimensions,
  M4: FASTENER_RECIPES.find((recipe) => recipe.id === 'starter-m4-heat-set')!.dimensions,
};

export function bossOuterDiameter(holeDiameter: number): number {
  return Math.max(holeDiameter + 4.8, 6);
}
