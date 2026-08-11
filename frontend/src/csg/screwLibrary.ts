import type { ScrewSize } from '../types/project';

/**
 * Starter/approximate hole dimensions for common miniature machine screws used
 * in 3D-printed enclosures. Not guaranteed specs for any specific screw or
 * insert brand -- verify against your actual hardware before a real print,
 * same disclaimer as the connector library.
 */
export interface ScrewHoleSpec {
  clearanceDiameter: number; // through-hole in the lid, screw passes freely
  selfTapPilotDiameter: number; // pilot hole for a screw to cut its own thread
  heatSetHoleDiameter: number; // bore for a heat-set brass insert
  heatSetDepth: number; // typical insert length
  headDiameter: number; // socket-head cap screw head, sized for counterbores
}

export const SCREW_HOLE_SPECS: Record<ScrewSize, ScrewHoleSpec> = {
  M2: { clearanceDiameter: 2.4, selfTapPilotDiameter: 1.6, heatSetHoleDiameter: 3.2, heatSetDepth: 3.0, headDiameter: 3.8 },
  'M2.5': { clearanceDiameter: 2.9, selfTapPilotDiameter: 2.0, heatSetHoleDiameter: 3.5, heatSetDepth: 4.0, headDiameter: 4.5 },
  M3: { clearanceDiameter: 3.4, selfTapPilotDiameter: 2.5, heatSetHoleDiameter: 4.0, heatSetDepth: 5.0, headDiameter: 5.5 },
  M4: { clearanceDiameter: 4.5, selfTapPilotDiameter: 3.3, heatSetHoleDiameter: 5.6, heatSetDepth: 6.0, headDiameter: 7.0 },
};

export function bossOuterDiameter(holeDiameter: number): number {
  return Math.max(holeDiameter + 4.8, 6);
}
