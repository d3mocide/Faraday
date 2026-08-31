export interface SlideRailMetricsInput {
  splitHeight: number;
  wallThickness: number;
  wallGap: number;
  railDepth?: number;
}

export interface SlideRailMetrics {
  channelClearance: number;
  flangeThickness: number;
  hookThickness: number;
  railDepth: number;
  flangeZ: number;
  hookZ: number;
  railBottom: number;
  coverOverlap: number;
}

/** The flat cover's own thickness -- shared so the CSG pipeline can find exactly where the plate's
 * underside sits (`height - slideRailPlateThickness(wallThickness)`) without duplicating the
 * clamp `resolveSlideRailMetrics` applies internally. */
export function slideRailPlateThickness(wallThickness: number): number {
  return Math.max(wallThickness, 1.2);
}

/** Shared vertical recipe for a captive slide rail. The cover deliberately extends below the
 * nominal seam, so its visible envelope is not the same as a conventional lid percentage. */
export function resolveSlideRailMetrics({
  splitHeight,
  wallThickness,
  wallGap,
  railDepth: requestedRailDepth,
}: SlideRailMetricsInput): SlideRailMetrics {
  const channelClearance = Math.max(wallGap, 0.2);
  const flangeThickness = Math.max(Math.min(wallThickness * 0.55, 1.1), 0.7);
  const hookThickness = flangeThickness;
  const railDepth = Math.min(
    Math.max(requestedRailDepth ?? 4, 2),
    Math.max(splitHeight - wallThickness, 2),
  );
  const flangeZ = splitHeight - flangeThickness / 2 - channelClearance;
  const hookZ = flangeZ - flangeThickness / 2 - channelClearance - hookThickness / 2;
  const railBottom = Math.max(hookZ - hookThickness / 2, splitHeight - railDepth, 0);
  return {
    channelClearance,
    flangeThickness,
    hookThickness,
    railDepth,
    flangeZ,
    hookZ,
    railBottom,
    coverOverlap: splitHeight - railBottom,
  };
}

/** Leaves a wall-height buffer above the floor after the rail hooks extend below the seam. */
export function minimumSlideRailSplitHeight(wallThickness: number, wallGap: number): number {
  const fullCapture = resolveSlideRailMetrics({
    splitHeight: 100,
    wallThickness,
    wallGap,
  }).coverOverlap;
  return wallThickness + fullCapture + 1;
}
