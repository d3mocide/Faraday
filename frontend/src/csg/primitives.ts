import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type {
  CornerStyle,
  GasketSpec,
  ScrewColumnShape,
  ScrewCount,
  ScrewSpec,
} from '../types/project';
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
  outerLength: number; // outer footprint -- what exterior columns stand against
  outerWidth: number;
  wallThickness: number; // how much solid lid sits over an interior boss, for the head pocket
  splitHeight: number;
  outerHeight: number;
  screw: ScrewSpec;
}

/** `insetOverride`, if given, replaces the default `bossRadius + 1` gap between the boss center
 * and the interior cavity wall -- see ScrewSpec.edgeInset. A smaller inset pulls bosses toward
 * the case's outer edge (and away from a board-mount sitting in the middle of the cavity);
 * clamped to >= 0 same as the default, since a negative value would push the boss position past
 * the cavity edge math below expects. */
export function bossPositions(
  count: ScrewCount,
  halfLength: number,
  halfWidth: number,
  bossRadius: number,
  insetOverride?: number,
): Array<[number, number]> {
  const inset = Math.max(insetOverride ?? bossRadius + 1, 0);
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

/**
 * Screw columns standing on the *outside* of the front and back walls, overlapping them just
 * enough to weld. This is what a case whose board fills the whole interior has to use -- there is
 * no floor left for interior corner bosses -- and it's how commercial carrier-board enclosures
 * (and the Waveshare CM4 preset) do it. Left/right walls are deliberately left alone until count 8:
 * those are the faces most likely to be slide-in connector panels.
 */
export function exteriorBossPositions(
  count: ScrewCount,
  halfLength: number,
  halfWidth: number,
  bossRadius: number,
): Array<[number, number]> {
  const overlap = Math.min(2, bossRadius);
  const y = halfWidth + bossRadius - overlap;
  const x = Math.max(halfLength - bossRadius - 1, 0);
  const corners: Array<[number, number]> = [
    [x, y],
    [x, -y],
    [-x, y],
    [-x, -y],
  ];
  if (count === 4) return corners;
  if (count === 6) return [...corners, [0, y], [0, -y]];
  const sideX = halfLength + bossRadius - overlap;
  return [...corners, [0, y], [0, -y], [sideX, 0], [-sideX, 0]];
}

/** Evenly-spaced bosses around a circle -- the cylinder-body counterpart to bossPositions(). */
function bossPositionsCircular(
  count: ScrewCount,
  cavityRadius: number,
  bossRadius: number,
  insetOverride?: number,
): Array<[number, number]> {
  const inset = Math.max(insetOverride ?? bossRadius + 1, 0);
  const radius = Math.max(cavityRadius - inset, 0);
  const positions: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const theta = (2 * Math.PI * i) / count;
    positions.push([radius * Math.cos(theta), radius * Math.sin(theta)]);
  }
  return positions;
}

/** A screw column: a round or square post spanning [zBottom, zBottom + height] on the Z axis. */
function columnSolid(
  wasm: ManifoldToplevel,
  shape: ScrewColumnShape,
  size: number,
  height: number,
  zBottom: number,
): Manifold {
  return shape === 'square'
    ? wasm.Manifold.cube([size, size, height], false).translate(-size / 2, -size / 2, zBottom)
    : cylinderZ(wasm, size, height, zBottom);
}

/**
 * The wall planes a set of screw columns lean on, so a hanging column's foot knows which way to
 * slope. Interior columns sit inside the cavity with the wall outboard of them; exterior ones
 * straddle the outside of the wall, so their material retreats the other way.
 */
export type FootWalls =
  | { kind: 'box'; halfX: number; halfY: number; side: 'interior' | 'exterior' }
  | { kind: 'cylinder'; radius: number };

/** One wall a column's foot has to run back into: `dx, dy` is the unit XY direction the foot's
 * material retreats in as it descends (away from that wall), and `run` the 45-degree drop that
 * lands the taper flush on the wall plane. */
interface FootAnchor {
  dx: number;
  dy: number;
  run: number;
}

/** Half-width of a column's cross-section along a direction -- constant for a round post, but a
 * square one reaches further along its diagonal than along its faces. */
function columnHalfExtent(shape: ScrewColumnShape, size: number, dx: number, dy: number): number {
  return shape === 'square' ? ((Math.abs(dx) + Math.abs(dy)) * size) / 2 : size / 2;
}

/** The slope plane starts this far outboard of the column's widest point rather than exactly on
 * it: grazing a cylinder along its own tangent line produces a knife edge of zero width, which
 * comes back out of the CSG as a non-manifold sliver. */
const FOOT_SLOPE_CLEARANCE = 0.05;

/** `back` is how far behind the column's center the wall plane sits, measured against `dx, dy`.
 * Null whenever the column doesn't actually reach that wall -- there is nothing there to slope
 * into, and a taper toward it would just hang in the air on the other side. */
function footAnchor(
  dx: number,
  dy: number,
  back: number,
  shape: ScrewColumnShape,
  size: number,
): FootAnchor | null {
  const extent = columnHalfExtent(shape, size, dx, dy);
  if (back < 0 || back >= extent) return null;
  return { dx, dy, run: extent + FOOT_SLOPE_CLEARANCE + back };
}

function footAnchors(
  [x, y]: [number, number],
  walls: FootWalls,
  shape: ScrewColumnShape,
  size: number,
): FootAnchor[] {
  if (walls.kind === 'cylinder') {
    const radius = Math.hypot(x, y);
    if (radius < 1e-6) return [];
    const anchor = footAnchor(-x / radius, -y / radius, walls.radius - radius, shape, size);
    return anchor ? [anchor] : [];
  }

  const anchors: FootAnchor[] = [];
  for (const [coord, half, axis] of [
    [x, walls.halfX, 'x'],
    [y, walls.halfY, 'y'],
  ] as const) {
    if (coord === 0) continue;
    const sign = Math.sign(coord);
    const inward = walls.side === 'interior';
    const back = inward ? half - Math.abs(coord) : Math.abs(coord) - half;
    const dir = inward ? -sign : sign;
    const anchor = footAnchor(
      axis === 'x' ? dir : 0,
      axis === 'x' ? 0 : dir,
      back,
      shape,
      size,
    );
    if (anchor) anchors.push(anchor);
  }
  return anchors;
}

/** Everything under a plane that climbs at 45 degrees along `dx, dy`, so that intersecting a
 * column with it shaves the column's far side away at exactly the rate the column descends. The
 * plane is positioned to graze the column's outer edge at z = zBottom, which is what makes the
 * foot start as the full cross-section and lose material only on the way down. */
function footSlopeSolid(
  wasm: ManifoldToplevel,
  extent: number,
  zBottom: number,
  anchor: FootAnchor,
): Manifold {
  // Keep the half-space `s - z <= extent - zBottom`, where s is distance along the anchor.
  const offset = extent + FOOT_SLOPE_CLEARANCE - zBottom;
  const big = 200 + 4 * (extent + zBottom + Math.abs(offset));
  const yawDeg = (Math.atan2(anchor.dy, anchor.dx) * 180) / Math.PI;
  return wasm.Manifold.cube([big, big, big], true)
    .translate(-big / 2, 0, 0)
    .rotate(0, 45, 0)
    .translate(offset / 2, 0, -offset / 2)
    .rotate(0, 0, yawDeg);
}

/**
 * The sloped foot under a column that doesn't reach the floor: a 45-degree taper off its lower end
 * that runs back into the wall the column is welded to, instead of leaving it stopping dead in
 * mid-air. The taper is one-sided per wall -- it keeps the wall side of the column full and eats
 * away only the free side, so the slope actually lands on the wall (a cone shrinking away from
 * every side at once ends in a stub floating clear of it). The slope prints without support.
 * Returns null for a full-height column, which stands on the floor and needs nothing, or for one
 * with no wall within reach to slope into.
 */
function columnFoot(
  wasm: ManifoldToplevel,
  shape: ScrewColumnShape,
  size: number,
  zBottom: number,
  anchors: FootAnchor[],
): Manifold | null {
  if (anchors.length === 0) return null;
  const run = Math.min(Math.max(...anchors.map((anchor) => anchor.run)), zBottom);
  if (run < 0.6) return null;

  let foot = columnSolid(wasm, shape, size, run, zBottom - run);
  for (const anchor of anchors) {
    const extent = columnHalfExtent(shape, size, anchor.dx, anchor.dy);
    foot = foot.intersect(footSlopeSolid(wasm, extent, zBottom, anchor));
  }
  return foot;
}

/** How much of the base's height a column occupies: the full floor-to-seam span by default, or a
 * shorter post hanging down from the seam when ScrewSpec.columnHeight asks for one. */
export function columnSpan(
  screw: ScrewSpec,
  splitHeight: number,
): { zBottom: number; height: number } {
  if (screw.columnHeight === undefined) return { zBottom: 0, height: splitHeight };
  const height = Math.min(Math.max(screw.columnHeight, 1), splitHeight);
  return { zBottom: splitHeight - height, height };
}

/**
 * Depth of the concealed-head pocket in the lid, or 0 for a flush head. `solidTop` is how much
 * material the lid actually has above its cavity at the screw -- usually the wall thickness, not
 * the whole lid piece, since the piece is a tray with air underneath. The pocket always leaves
 * 0.8mm of that behind: any deeper and it stops being a counterbore and starts being a hole for
 * the head to drop through.
 */
export function counterboreDepth(screw: ScrewSpec, solidTop: number): number {
  if (screw.headStyle !== 'counterbore') return 0;
  return Math.max(Math.min(2.6, solidTop - 0.8), 0);
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
  wallThickness: number,
  walls: FootWalls,
): { base: Manifold; lid: Manifold } {
  const spec = SCREW_HOLE_SPECS[screw.size];
  const pilotDiameter =
    screw.insertType === 'heat-set' ? spec.heatSetHoleDiameter : spec.selfTapPilotDiameter;
  const outerDiameter = bossOuterDiameter(pilotDiameter);
  const shape = screw.shape ?? 'round';
  const { zBottom, height } = columnSpan(screw, splitHeight);
  const holeDepth =
    screw.insertType === 'heat-set'
      ? Math.min(spec.heatSetDepth, height - 1)
      : Math.max(height - 1.5, 1);
  const lidThickness = Math.max(outerHeight - splitHeight, 0.5);
  const boreDepth = counterboreDepth(screw, Math.min(lidThickness, wallThickness));

  let nextBase = base;
  let nextLid = lid;
  for (const [x, y] of positions) {
    nextBase = nextBase.add(
      columnSolid(wasm, shape, outerDiameter, height, zBottom).translate(x, y, 0),
    );
    const foot = columnFoot(
      wasm,
      shape,
      outerDiameter,
      zBottom,
      footAnchors([x, y], walls, shape, outerDiameter),
    );
    if (foot) nextBase = nextBase.add(foot.translate(x, y, 0));

    const pilotHole = cylinderZ(wasm, pilotDiameter, holeDepth, splitHeight - holeDepth).translate(
      x,
      y,
      0,
    );
    nextBase = nextBase.subtract(pilotHole);

    const clearanceHole = cylinderZ(wasm, spec.clearanceDiameter, lidThickness, splitHeight).translate(
      x,
      y,
      0,
    );
    nextLid = nextLid.subtract(clearanceHole);

    if (boreDepth > 0) {
      // Head pocket, opened from the lid's outer face downward.
      nextLid = nextLid.subtract(
        cylinderZ(wasm, spec.headDiameter + 0.6, boreDepth + 1, outerHeight - boreDepth).translate(
          x,
          y,
          0,
        ),
      );
    }
  }

  return { base: nextBase, lid: nextLid };
}

export function bossRadiusFor(screw: ScrewSpec): number {
  const spec = SCREW_HOLE_SPECS[screw.size];
  const pilotDiameter = screw.insertType === 'heat-set' ? spec.heatSetHoleDiameter : spec.selfTapPilotDiameter;
  return bossOuterDiameter(pilotDiameter) / 2;
}

/**
 * Exterior counterpart to applyScrewBossLidAt: the column has to exist on *both* pieces (an
 * interior boss lives entirely in the base, under a flat lid, but an exterior one is a continuous
 * post that the split cuts in half), so the lid gets matching material plus its clearance hole
 * rather than a hole alone.
 */
function applyExteriorScrewBossLidAt(
  wasm: ManifoldToplevel,
  base: Manifold,
  lid: Manifold,
  splitHeight: number,
  outerHeight: number,
  screw: ScrewSpec,
  positions: Array<[number, number]>,
  walls: FootWalls,
): { base: Manifold; lid: Manifold } {
  const spec = SCREW_HOLE_SPECS[screw.size];
  const pilotDiameter =
    screw.insertType === 'heat-set' ? spec.heatSetHoleDiameter : spec.selfTapPilotDiameter;
  const outerDiameter = bossOuterDiameter(pilotDiameter);
  const shape = screw.shape ?? 'round';
  const { zBottom, height } = columnSpan(screw, splitHeight);
  const holeDepth =
    screw.insertType === 'heat-set'
      ? Math.min(spec.heatSetDepth, height - 1)
      : Math.max(height - 1.5, 1);
  const lidHeight = Math.max(outerHeight - splitHeight, 0.5);
  // An exterior column is solid all the way up, so the head pocket is only limited by the lid
  // piece's own height, not by a cavity beneath it.
  const boreDepth = counterboreDepth(screw, lidHeight);

  let nextBase = base;
  let nextLid = lid;
  for (const [x, y] of positions) {
    const column = columnSolid(wasm, shape, outerDiameter, height, zBottom).translate(x, y, 0);
    const foot = columnFoot(
      wasm,
      shape,
      outerDiameter,
      zBottom,
      footAnchors([x, y], walls, shape, outerDiameter),
    );
    nextBase = nextBase
      .add(foot ? column.add(foot.translate(x, y, 0)) : column)
      .subtract(
        cylinderZ(wasm, pilotDiameter, holeDepth, splitHeight - holeDepth).translate(x, y, 0),
      );

    nextLid = nextLid
      .add(columnSolid(wasm, shape, outerDiameter, lidHeight, splitHeight).translate(x, y, 0))
      .subtract(
        cylinderZ(wasm, spec.clearanceDiameter, lidHeight + 1, splitHeight - 0.5).translate(x, y, 0),
      );

    if (boreDepth > 0) {
      nextLid = nextLid.subtract(
        cylinderZ(wasm, spec.headDiameter + 0.6, boreDepth + 1, outerHeight - boreDepth).translate(
          x,
          y,
          0,
        ),
      );
    }
  }

  return { base: nextBase, lid: nextLid };
}

/** Adds corner bosses (with pilot/insert holes) to a box base and matching clearance holes to the lid. */
export function applyScrewBossLid(
  wasm: ManifoldToplevel,
  base: Manifold,
  lid: Manifold,
  params: ScrewBossLidParams,
): { base: Manifold; lid: Manifold } {
  const { innerLength, innerWidth, outerLength, outerWidth, wallThickness, splitHeight, outerHeight, screw } =
    params;
  if (screw.placement === 'exterior') {
    return applyExteriorScrewBossLidAt(
      wasm,
      base,
      lid,
      splitHeight,
      outerHeight,
      screw,
      exteriorBossPositions(screw.count, outerLength / 2, outerWidth / 2, bossRadiusFor(screw)),
      { kind: 'box', halfX: outerLength / 2, halfY: outerWidth / 2, side: 'exterior' },
    );
  }
  const bossRadius = bossRadiusFor(screw);
  return applyScrewBossLidAt(
    wasm,
    base,
    lid,
    splitHeight,
    outerHeight,
    screw,
    bossPositions(screw.count, innerLength / 2, innerWidth / 2, bossRadius, hangingInset(screw, bossRadius)),
    wallThickness,
    { kind: 'box', halfX: innerLength / 2, halfY: innerWidth / 2, side: 'interior' },
  );
}

/** A column hanging from the seam has no floor under it, so it has to reach into the wall to weld:
 * the inset is capped at just inside the boss radius, overriding a user edgeInset that would leave
 * it floating. Full-height columns keep whatever inset was asked for -- they stand on the floor. */
function hangingInset(screw: ScrewSpec, bossRadius: number): number | undefined {
  if (screw.columnHeight === undefined) return screw.edgeInset;
  const maxInset = Math.max(bossRadius - 0.6, 0);
  return Math.min(screw.edgeInset ?? maxInset, maxInset);
}

interface ScrewBossLidCylinderParams {
  innerDiameter: number; // base cavity diameter (diameter - 2*wallThickness)
  wallThickness: number;
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
  const { innerDiameter, wallThickness, splitHeight, outerHeight, screw } = params;
  const bossRadius = bossRadiusFor(screw);
  const positions = bossPositionsCircular(
    screw.count,
    innerDiameter / 2,
    bossRadius,
    hangingInset(screw, bossRadius),
  );
  return applyScrewBossLidAt(wasm, base, lid, splitHeight, outerHeight, screw, positions, wallThickness, {
    kind: 'cylinder',
    radius: innerDiameter / 2,
  });
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
