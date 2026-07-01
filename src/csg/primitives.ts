import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { CornerStyle, ScrewCount, ScrewSpec } from '../types/project';
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

/** Adds corner bosses (with pilot/insert holes) to the base and matching clearance holes to the lid. */
export function applyScrewBossLid(
  wasm: ManifoldToplevel,
  base: Manifold,
  lid: Manifold,
  params: ScrewBossLidParams,
): { base: Manifold; lid: Manifold } {
  const { innerLength, innerWidth, splitHeight, outerHeight, screw } = params;
  const spec = SCREW_HOLE_SPECS[screw.size];
  const pilotDiameter =
    screw.insertType === 'heat-set' ? spec.heatSetHoleDiameter : spec.selfTapPilotDiameter;
  const outerDiameter = bossOuterDiameter(pilotDiameter);
  const holeDepth =
    screw.insertType === 'heat-set'
      ? Math.min(spec.heatSetDepth, splitHeight - 1)
      : Math.max(splitHeight - 1.5, 1);

  const positions = bossPositions(screw.count, innerLength / 2, innerWidth / 2, outerDiameter / 2);

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
