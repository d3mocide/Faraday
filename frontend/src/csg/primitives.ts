import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { CornerStyle, GasketSpec, ScrewCount, ScrewSpec } from '../types/project';
import { SCREW_HOLE_SPECS, bossOuterDiameter } from './screwLibrary';

export function footprintCrossSection(
  wasm: ManifoldToplevel,
  length: number,
  width: number,
  cornerStyle: CornerStyle,
): CrossSection {
  const { CrossSection } = wasm;
  const maxRadius = Math.min(length, width) / 2;
  const radius = Math.min(Math.max(cornerStyle.radius, 0), Math.max(maxRadius - 0.001, 0));

  if (cornerStyle.type === 'sharp' || radius <= 0) {
    return CrossSection.square([length, width], true);
  }

  if (cornerStyle.type === 'rounded') {
    return CrossSection.square([length - 2 * radius, width - 2 * radius], true).offset(
      radius,
      'Round',
    );
  }

  // chamfered: flat corner cuts of size `radius`
  const hl = length / 2;
  const hw = width / 2;
  const points: [number, number][] = [
    [-hl + radius, -hw],
    [hl - radius, -hw],
    [hl, -hw + radius],
    [hl, hw - radius],
    [hl - radius, hw],
    [-hl + radius, hw],
    [-hl, hw - radius],
    [-hl, -hw + radius],
  ];
  return new CrossSection(points);
}

export function boxShell(
  wasm: ManifoldToplevel,
  length: number,
  width: number,
  height: number,
  cornerStyle: CornerStyle,
): Manifold {
  const footprint = footprintCrossSection(wasm, length, width, cornerStyle);
  return footprint.extrude(height);
}

export function shrinkCornerStyle(cornerStyle: CornerStyle, delta: number): CornerStyle {
  return { type: cornerStyle.type, radius: Math.max(0, cornerStyle.radius - delta) };
}

/** Solid cylinder shell (before hollowing), spanning z=0 to z=height, centered on the Z axis --
 * the cylinder-body counterpart to boxShell. */
export function cylinderShell(wasm: ManifoldToplevel, diameter: number, height: number): Manifold {
  const r = diameter / 2;
  return wasm.Manifold.cylinder(height, r, r, 0, false);
}

export function cylinderZ(
  wasm: ManifoldToplevel,
  diameter: number,
  height: number,
  zBottom: number,
): Manifold {
  const r = diameter / 2;
  return wasm.Manifold.cylinder(height, r, r).translate(0, 0, zBottom);
}

interface ScrewBossLidParams {
  innerLength: number; // footprint of the base cavity (length - 2*wallThickness)
  innerWidth: number;
  splitHeight: number;
  outerHeight: number;
  screw: ScrewSpec;
}

function bossPositions(
  count: ScrewCount,
  halfLength: number,
  halfWidth: number,
  bossRadius: number,
): Array<[number, number]> {
  const inset = bossRadius + 1;
  const x = Math.max(halfLength - inset, 0);
  const y = Math.max(halfWidth - inset, 0);
  const corners: Array<[number, number]> = [
    [x, y],
    [x, -y],
    [-x, y],
    [-x, -y],
  ];
  if (count === 4) return corners;
  if (count === 6) return [...corners, [0, y], [0, -y]];
  return [...corners, [0, y], [0, -y], [x, 0], [-x, 0]];
}

/** Evenly-spaced bosses around a circle -- the cylinder-body counterpart to bossPositions(). */
function bossPositionsCircular(
  count: ScrewCount,
  cavityRadius: number,
  bossRadius: number,
): Array<[number, number]> {
  const radius = Math.max(cavityRadius - (bossRadius + 1), 0);
  const positions: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const theta = (2 * Math.PI * i) / count;
    positions.push([radius * Math.cos(theta), radius * Math.sin(theta)]);
  }
  return positions;
}

/** Adds bosses (with pilot/insert holes) to the base and matching clearance holes to the lid, at
 * the given positions. Shared by the box (corner bosses) and cylinder (evenly-spaced ring)
 * bodies -- see bossPositions()/bossPositionsCircular() and their generateEnclosure.ts call sites. */
export function applyScrewBossLidAt(
  wasm: ManifoldToplevel,
  base: Manifold,
  lid: Manifold,
  splitHeight: number,
  outerHeight: number,
  screw: ScrewSpec,
  positions: Array<[number, number]>,
): { base: Manifold; lid: Manifold } {
  const spec = SCREW_HOLE_SPECS[screw.size];
  const pilotDiameter =
    screw.insertType === 'heat-set' ? spec.heatSetHoleDiameter : spec.selfTapPilotDiameter;
  const outerDiameter = bossOuterDiameter(pilotDiameter);
  const holeDepth =
    screw.insertType === 'heat-set'
      ? Math.min(spec.heatSetDepth, splitHeight - 1)
      : Math.max(splitHeight - 1.5, 1);

  let nextBase = base;
  let nextLid = lid;
  for (const [x, y] of positions) {
    const boss = cylinderZ(wasm, outerDiameter, splitHeight, 0).translate(x, y, 0);
    nextBase = nextBase.add(boss);

    const pilotHole = cylinderZ(wasm, pilotDiameter, holeDepth, splitHeight - holeDepth).translate(
      x,
      y,
      0,
    );
    nextBase = nextBase.subtract(pilotHole);

    const clearanceHole = cylinderZ(
      wasm,
      spec.clearanceDiameter,
      outerHeight - splitHeight,
      splitHeight,
    ).translate(x, y, 0);
    nextLid = nextLid.subtract(clearanceHole);
  }

  return { base: nextBase, lid: nextLid };
}

function bossRadiusFor(screw: ScrewSpec): number {
  const spec = SCREW_HOLE_SPECS[screw.size];
  const pilotDiameter = screw.insertType === 'heat-set' ? spec.heatSetHoleDiameter : spec.selfTapPilotDiameter;
  return bossOuterDiameter(pilotDiameter) / 2;
}

/** Adds corner bosses (with pilot/insert holes) to a box base and matching clearance holes to the lid. */
export function applyScrewBossLid(
  wasm: ManifoldToplevel,
  base: Manifold,
  lid: Manifold,
  params: ScrewBossLidParams,
): { base: Manifold; lid: Manifold } {
  const { innerLength, innerWidth, splitHeight, outerHeight, screw } = params;
  const positions = bossPositions(screw.count, innerLength / 2, innerWidth / 2, bossRadiusFor(screw));
  return applyScrewBossLidAt(wasm, base, lid, splitHeight, outerHeight, screw, positions);
}

interface ScrewBossLidCylinderParams {
  innerDiameter: number; // base cavity diameter (diameter - 2*wallThickness)
  splitHeight: number;
  outerHeight: number;
  screw: ScrewSpec;
}

/** Adds a ring of bosses (with pilot/insert holes) to a cylinder base and matching clearance holes to the lid. */
export function applyScrewBossLidCylinder(
  wasm: ManifoldToplevel,
  base: Manifold,
  lid: Manifold,
  params: ScrewBossLidCylinderParams,
): { base: Manifold; lid: Manifold } {
  const { innerDiameter, splitHeight, outerHeight, screw } = params;
  const positions = bossPositionsCircular(screw.count, innerDiameter / 2, bossRadiusFor(screw));
  return applyScrewBossLidAt(wasm, base, lid, splitHeight, outerHeight, screw, positions);
}

interface FrictionLipParams {
  innerLength: number; // base cavity footprint (length - 2*wallThickness)
  innerWidth: number;
  innerCornerStyle: CornerStyle;
  splitHeight: number;
  wallThickness: number;
  wallGap: number;
}

/** Adds an inset skirt to the underside of the lid that friction-fits into the base cavity. */
export function applyFrictionLipLid(
  wasm: ManifoldToplevel,
  lid: Manifold,
  params: FrictionLipParams,
): Manifold {
  const { innerLength, innerWidth, innerCornerStyle, splitHeight, wallThickness, wallGap } =
    params;

  const skirtWallThickness = Math.min(wallThickness, 1.6);
  const engagementDepth = Math.min(4, Math.max(splitHeight - wallThickness - 1, 1));

  const outerLength = Math.max(innerLength - 2 * wallGap, skirtWallThickness * 2 + 1);
  const outerWidth = Math.max(innerWidth - 2 * wallGap, skirtWallThickness * 2 + 1);
  const outerCornerStyle = shrinkCornerStyle(innerCornerStyle, wallGap);

  const skirtOuter = boxShell(wasm, outerLength, outerWidth, engagementDepth, outerCornerStyle);
  const skirtInner = boxShell(
    wasm,
    Math.max(outerLength - 2 * skirtWallThickness, 0.5),
    Math.max(outerWidth - 2 * skirtWallThickness, 0.5),
    engagementDepth,
    shrinkCornerStyle(outerCornerStyle, skirtWallThickness),
  );

  const skirt = skirtOuter
    .subtract(skirtInner)
    .translate(0, 0, splitHeight - engagementDepth);

  return lid.add(skirt);
}

interface FrictionLipCylinderParams {
  innerDiameter: number; // base cavity diameter (diameter - 2*wallThickness)
  splitHeight: number;
  wallThickness: number;
  wallGap: number;
}

/** Adds an inset annular skirt to the underside of a cylinder lid that friction-fits into the base cavity. */
export function applyFrictionLipLidCylinder(
  wasm: ManifoldToplevel,
  lid: Manifold,
  params: FrictionLipCylinderParams,
): Manifold {
  const { innerDiameter, splitHeight, wallThickness, wallGap } = params;

  const skirtWallThickness = Math.min(wallThickness, 1.6);
  const engagementDepth = Math.min(4, Math.max(splitHeight - wallThickness - 1, 1));
  const outerDiameter = Math.max(innerDiameter - 2 * wallGap, skirtWallThickness * 2 + 1);

  const skirtOuter = cylinderShell(wasm, outerDiameter, engagementDepth);
  const skirtInner = cylinderShell(
    wasm,
    Math.max(outerDiameter - 2 * skirtWallThickness, 0.5),
    engagementDepth,
  );

  const skirt = skirtOuter.subtract(skirtInner).translate(0, 0, splitHeight - engagementDepth);

  return lid.add(skirt);
}

/**
 * Cantilever snap-fit lid (DESIGN.md §7/§13 stretch goal): a small flexible tab hangs from the
 * underside of the lid into the base cavity, with a rounded nub near its tip that pokes past the
 * tab's own face and seats into a matching pocket cut into the base wall. This models the final
 * assembled state only (two independently-printed solids) -- it doesn't attempt to simulate the
 * tab flexing during insertion, and the nub/pocket are plain spheres rather than a wedge with a
 * lead-in ramp + sharp catching ledge (the textbook cantilever-snap profile), which would hold
 * better but need more per-shape geometry to get right. Same "verify before printing, this is a
 * starting point not an engineered spec" spirit as the connector/screw libraries.
 */
const SNAP_NUB_RADIUS = 1.0; // mm
const SNAP_POCKET_CLEARANCE = 0.3; // mm, pocket radius = nub radius + this

function snapTabGeometry(splitHeight: number, wallThickness: number) {
  const tabThickness = Math.min(wallThickness, 1.6);
  const engagementDepth = Math.min(6, Math.max(splitHeight - wallThickness - 1, 2));
  const nubZ = splitHeight - engagementDepth + 1;
  return { tabThickness, engagementDepth, nubZ };
}

interface SnapFitLidParams {
  innerLength: number;
  innerWidth: number;
  splitHeight: number;
  wallThickness: number;
  wallGap: number;
}

/** Two tabs, on the midpoints of the front and back walls. */
export function applySnapFitLid(
  wasm: ManifoldToplevel,
  base: Manifold,
  lid: Manifold,
  params: SnapFitLidParams,
): { base: Manifold; lid: Manifold } {
  const { innerLength, innerWidth, splitHeight, wallThickness, wallGap } = params;
  const { tabThickness, engagementDepth, nubZ } = snapTabGeometry(splitHeight, wallThickness);
  const tabWidth = Math.min(Math.max(Math.min(innerLength, innerWidth) * 0.25, 6), 14);
  const outerY = Math.max(innerWidth / 2 - wallGap, tabThickness + 1);

  let nextBase = base;
  let nextLid = lid;

  for (const sign of [-1, 1] as const) {
    const tab = wasm.Manifold.cube([tabWidth, tabThickness, engagementDepth], true).translate(
      0,
      sign * (outerY - tabThickness / 2),
      splitHeight - engagementDepth / 2,
    );
    const nub = wasm.Manifold.sphere(SNAP_NUB_RADIUS).translate(0, sign * outerY, nubZ);
    nextLid = nextLid.add(tab).add(nub);

    const pocket = wasm.Manifold.sphere(SNAP_NUB_RADIUS + SNAP_POCKET_CLEARANCE).translate(
      0,
      sign * outerY,
      nubZ,
    );
    nextBase = nextBase.subtract(pocket);
  }

  return { base: nextBase, lid: nextLid };
}

interface SnapFitLidCylinderParams {
  innerDiameter: number;
  splitHeight: number;
  wallThickness: number;
  wallGap: number;
}

/** Two tabs, at opposite (0deg/180deg) points around the circumference. */
export function applySnapFitLidCylinder(
  wasm: ManifoldToplevel,
  base: Manifold,
  lid: Manifold,
  params: SnapFitLidCylinderParams,
): { base: Manifold; lid: Manifold } {
  const { innerDiameter, splitHeight, wallThickness, wallGap } = params;
  const { tabThickness, engagementDepth, nubZ } = snapTabGeometry(splitHeight, wallThickness);
  const tabWidth = Math.min(Math.max(innerDiameter * 0.2, 6), 14);
  const outerR = Math.max(innerDiameter / 2 - wallGap, tabThickness + 1);

  let nextBase = base;
  let nextLid = lid;

  for (const sign of [-1, 1] as const) {
    const x = sign * outerR;
    // Tab's outward (radial) face sits at |x|=outerR, extending inward by tabThickness -- built
    // axis-aligned (tangential width along Y, radial thickness along X) since these two positions
    // are already axis-aligned (0deg/180deg), no Z rotation needed.
    const tab = wasm.Manifold.cube([tabThickness, tabWidth, engagementDepth], true).translate(
      x - sign * (tabThickness / 2),
      0,
      splitHeight - engagementDepth / 2,
    );
    const nub = wasm.Manifold.sphere(SNAP_NUB_RADIUS).translate(x, 0, nubZ);
    nextLid = nextLid.add(tab).add(nub);

    const pocket = wasm.Manifold.sphere(SNAP_NUB_RADIUS + SNAP_POCKET_CLEARANCE).translate(x, 0, nubZ);
    nextBase = nextBase.subtract(pocket);
  }

  return { base: nextBase, lid: nextLid };
}

/**
 * Gasket/seal channel (DESIGN.md §13 stretch goal): a groove cut into the base's top rim, centered
 * in the wall thickness, sized to hold an O-ring or foam cord that the flat underside of the lid
 * compresses when assembled. Independent of lid.type -- combinable with any of the three lid
 * mating geometries above, which is why it's applied as a separate pass after them rather than
 * folded into each one.
 */
function clampGasket(gasket: GasketSpec, wallThickness: number, splitHeight: number) {
  const width = Math.min(Math.max(gasket.width, 0.5), Math.max(wallThickness - 0.4, 0.5));
  const depth = Math.min(Math.max(gasket.depth, 0.2), Math.max(splitHeight - 1, 0.2));
  return { width, depth };
}

interface GasketChannelBoxParams {
  length: number;
  width: number;
  cornerStyle: CornerStyle;
  wallThickness: number;
  splitHeight: number;
  gasket: GasketSpec;
}

export function applyGasketChannelBox(
  wasm: ManifoldToplevel,
  base: Manifold,
  params: GasketChannelBoxParams,
): Manifold {
  const { length, width, cornerStyle, wallThickness, splitHeight } = params;
  const { width: channelWidth, depth: channelDepth } = clampGasket(params.gasket, wallThickness, splitHeight);
  const centerInset = wallThickness / 2;
  const outerInset = Math.max(centerInset - channelWidth / 2, 0);
  const innerInset = centerInset + channelWidth / 2;

  const outerRing = boxShell(
    wasm,
    length - 2 * outerInset,
    width - 2 * outerInset,
    channelDepth,
    shrinkCornerStyle(cornerStyle, outerInset),
  );
  const innerRing = boxShell(
    wasm,
    Math.max(length - 2 * innerInset, 1),
    Math.max(width - 2 * innerInset, 1),
    channelDepth,
    shrinkCornerStyle(cornerStyle, innerInset),
  );
  const groove = outerRing.subtract(innerRing).translate(0, 0, splitHeight - channelDepth);
  return base.subtract(groove);
}

interface GasketChannelCylinderParams {
  diameter: number;
  wallThickness: number;
  splitHeight: number;
  gasket: GasketSpec;
}

export function applyGasketChannelCylinder(
  wasm: ManifoldToplevel,
  base: Manifold,
  params: GasketChannelCylinderParams,
): Manifold {
  const { diameter, wallThickness, splitHeight } = params;
  const { width: channelWidth, depth: channelDepth } = clampGasket(params.gasket, wallThickness, splitHeight);
  const centerInset = wallThickness / 2;
  const outerDiameter = diameter - 2 * Math.max(centerInset - channelWidth / 2, 0);
  const innerDiameter = Math.max(diameter - 2 * (centerInset + channelWidth / 2), 1);

  const outerRing = cylinderShell(wasm, outerDiameter, channelDepth);
  const innerRing = cylinderShell(wasm, innerDiameter, channelDepth);
  const groove = outerRing.subtract(innerRing).translate(0, 0, splitHeight - channelDepth);
  return base.subtract(groove);
}
