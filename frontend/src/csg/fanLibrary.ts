import type { FanMountSpec } from '../types/project';

/**
 * Standard axial fan footprints. Hole pitch is the square bolt circle measured center to center;
 * these are the sizes the industry has settled on, but — same disclaimer as the connector and
 * screw libraries — measure your actual fan before printing. The 20mm entry is the least
 * standardized of the set (some 20mm fans use 15.5mm), so check that one especially.
 */
export interface FanPreset {
  size: number; // mm, the fan's square footprint
  pitch: number; // mm, screw hole spacing
  screw: string; // typical screw, for the label only
  /** The most common body depth at this size, for the clearance ghost. Plenty of fans are thicker
   * (a 40x40x20 is easy to find) -- edit the depth on the placed feature if yours is. */
  depth: number;
}

export const FAN_PRESETS: FanPreset[] = [
  { size: 20, pitch: 16, screw: 'M2', depth: 10 },
  { size: 25, pitch: 20, screw: 'M2.5', depth: 10 },
  { size: 30, pitch: 24, screw: 'M3', depth: 10 },
  { size: 40, pitch: 32, screw: 'M3', depth: 10 },
  { size: 50, pitch: 40, screw: 'M4', depth: 15 },
  { size: 60, pitch: 50, screw: 'M4', depth: 25 },
  { size: 70, pitch: 61.5, screw: 'M4', depth: 25 },
  { size: 80, pitch: 71.5, screw: 'M4', depth: 25 },
  { size: 92, pitch: 82.5, screw: 'M4', depth: 25 },
  { size: 120, pitch: 105, screw: 'M4', depth: 25 },
];

export function findFanPreset(size: number): FanPreset | undefined {
  return FAN_PRESETS.find((preset) => preset.size === size);
}

/** A ready-to-place spec for a standard fan size: concentric grille, screw holes on the fan's own
 * bolt circle, no bosses (add them in the inspector if the fan needs to stand off the wall). */
export function fanSpecFor(size: number): FanMountSpec {
  const preset = findFanPreset(size) ?? FAN_PRESETS[3];
  // Clearance hole for the fan screw: M2 -> 2.4, M2.5 -> 2.9, M3 -> 3.4, M4 -> 4.5. Fan screws are
  // usually self-tapping into the fan's own corner bores, so this is the through-hole in the case.
  const screwHoleDiameter =
    preset.screw === 'M2' ? 2.4 : preset.screw === 'M2.5' ? 2.9 : preset.screw === 'M3' ? 3.4 : 4.5;
  // Rings scale with the fan: a 20mm fan can't carry 3mm rings and still have spokes worth having.
  const ringWidth = preset.size <= 25 ? 1.8 : preset.size <= 40 ? 3 : 4;
  return {
    size: preset.size,
    bodyDepth: preset.depth,
    holePitch: preset.pitch,
    screwHoleDiameter,
    grille: 'concentric',
    ringWidth,
    ringGap: preset.size <= 25 ? 1 : 1.5,
    spokeCount: 4,
    spokeWidth: preset.size <= 25 ? 1.6 : 2.6,
    hubDiameter: preset.size <= 25 ? 3 : 6,
    bossHeight: 0,
  };
}
