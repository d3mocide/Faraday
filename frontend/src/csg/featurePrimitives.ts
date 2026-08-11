import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type {
  ConnectorLibraryEntry,
  ConnectorSizeOverride,
  ExternalMountSpec,
  Face,
  Feature,
  VentSpec,
} from '../types/project';
import { faceFrame, type BodyGeometry } from './faceFrame';
import { cylinderZ } from './primitives';

interface HoleDims {
  holeShape: 'circle' | 'rect' | 'dshape';
  diameter?: number;
  width?: number;
  height?: number;
  cornerRadius?: number;
}

function connectorDims(entry: ConnectorLibraryEntry, override?: ConnectorSizeOverride): HoleDims {
  return {
    holeShape: entry.holeShape,
    diameter: override?.diameter ?? entry.diameter,
    width: override?.width ?? entry.width,
    height: override?.height ?? entry.height,
    cornerRadius: entry.cornerRadius,
  };
}

function holeCrossSection(wasm: ManifoldToplevel, dims: HoleDims): CrossSection {
  const { CrossSection } = wasm;

  if (dims.holeShape === 'dshape') {
    // Circle with a chord flat (anti-rotation D). `height` is the across-flat dimension
    // (round side to flat side); clamped so the flat never cuts past the center sliver
    // and a flat >= diameter degenerates gracefully to a full circle.
    const d = dims.diameter ?? 6.5;
    const r = d / 2;
    const acrossFlat = Math.min(Math.max(dims.height ?? d * 0.85, r + 0.1), d);
    const chordY = acrossFlat - r;
    return CrossSection.circle(r).subtract(
      CrossSection.square([d + 2, d + 2], true).translate(0, chordY + (d + 2) / 2),
    );
  }

  if (dims.holeShape === 'rect') {
    const width = dims.width ?? 5;
    const height = dims.height ?? 5;
    const radius = Math.min(dims.cornerRadius ?? 0, Math.min(width, height) / 2 - 0.01);
    if (radius <= 0) return CrossSection.square([width, height], true);
    return CrossSection.square([width - 2 * radius, height - 2 * radius], true).offset(radius, 'Round');
  }

  const diameter = dims.diameter ?? 5;
  return CrossSection.circle(diameter / 2);
}

/**
 * Orients a +Z-extruded solid so the cross-section's local X/Y axes land on the target face's
 * u/v axes (per faceFrame's convention) and the extrusion runs through the wall. The extrusion
 * is symmetric about its own origin (extrude's `center` option), so the *sign* of the
 * through-wall direction never matters — but the in-plane axis mapping does for anything
 * non-square (rect connectors, vent patterns): left/right/side need the extra spin around Z so
 * local X follows the face's u axis instead of ending up vertical.
 */
function orientAlongFace(solid: Manifold, face: Face, u: number): Manifold {
  switch (face) {
    case 'top':
    case 'bottom':
      return solid; // X=u, Y=v already
    case 'front':
    case 'back':
      return solid.rotate(90, 0, 0); // X->X=u, Y->Z=v
    case 'left':
    case 'right':
      return solid.rotate(90, 0, 0).rotate(0, 0, 90); // X->Y=u, Y->Z=v, extrusion along X
    case 'side': {
      // Same frame as left/right at theta=0 (tangent=u, Z=v), then spun to the feature's angle.
      const thetaDeg = u * 360;
      return solid.rotate(90, 0, 0).rotate(0, 0, 90 + thetaDeg);
    }
  }
}

/** Extrudes a cross-section through the wall at the feature's position, oriented to its face. */
function extrudeThroughWall(
  cross: CrossSection,
  feature: Feature,
  geom: BodyGeometry,
  wallThickness: number,
): Manifold {
  const depth = wallThickness + 4; // margin so it fully punches through any wall thickness
  const solid = orientAlongFace(
    cross.extrude(depth, undefined, undefined, undefined, true),
    feature.face,
    feature.u,
  );
  const [x, y, z] = faceFrame(feature.face, geom).toWorld(feature.u, feature.v);
  return solid.translate(x, y, z);
}

/** Builds a through-wall cutout primitive for a connector-cutout feature, positioned in world space. */
export function buildConnectorCutout(
  wasm: ManifoldToplevel,
  entry: ConnectorLibraryEntry,
  feature: Feature,
  geom: BodyGeometry,
  wallThickness: number,
): Manifold {
  const dims = connectorDims(entry, feature.connectorOverride);
  const cross = holeCrossSection(wasm, dims).rotate(feature.rotationDeg);
  return extrudeThroughWall(cross, feature, geom, wallThickness);
}

/** Builds a through-wall cutout for a custom-hole feature (user-defined circle or rect). */
export function buildCustomHole(
  wasm: ManifoldToplevel,
  feature: Feature,
  geom: BodyGeometry,
  wallThickness: number,
): Manifold {
  const spec = feature.custom;
  if (!spec) throw new Error('custom-hole feature is missing its custom spec');
  const dims: HoleDims =
    spec.shape === 'circle'
      ? { holeShape: 'circle', diameter: spec.width }
      : { holeShape: 'rect', width: spec.width, height: spec.height ?? spec.width };
  const cross = holeCrossSection(wasm, dims).rotate(feature.rotationDeg);
  return extrudeThroughWall(cross, feature, geom, wallThickness);
}

function ventCrossSection(wasm: ManifoldToplevel, spec: VentSpec): CrossSection {
  const { CrossSection } = wasm;
  const slotW = Math.max(spec.slotWidth, 0.5);
  const spacing = Math.max(spec.slotSpacing, slotW + 0.5);
  const areaW = Math.max(spec.areaWidth, slotW);
  const areaH = Math.max(spec.areaHeight, slotW);

  if (spec.pattern === 'slots') {
    // Horizontal slats with rounded ends (kind to FDM bridging), stacked up the v axis and
    // centered in the area. Spacing is center-to-center pitch.
    const rows = Math.max(1, Math.floor((areaH - slotW) / spacing) + 1);
    const span = (rows - 1) * spacing;
    const slat =
      areaW - slotW <= 0.01
        ? CrossSection.circle(slotW / 2)
        : CrossSection.square([areaW - slotW, 0.01], true).offset(slotW / 2 - 0.005, 'Round');
    const slats: CrossSection[] = [];
    for (let i = 0; i < rows; i++) {
      slats.push(slat.translate(0, -span / 2 + i * spacing));
    }
    return CrossSection.union(slats);
  }

  // Honeycomb: hexagonal holes (across-corners = slot width) on an offset grid with
  // center-to-center pitch = spacing, keeping every cell fully inside the area.
  const hex = CrossSection.circle(slotW / 2, 6);
  const dy = spacing * (Math.sqrt(3) / 2);
  const maxX = (areaW - slotW) / 2;
  const maxY = (areaH - slotW) / 2;
  const cells: CrossSection[] = [];
  const nRows = Math.floor(maxY / dy);
  for (let row = -nRows; row <= nRows; row++) {
    const xOff = row % 2 === 0 ? 0 : spacing / 2;
    const nCols = Math.floor((maxX + spacing) / spacing);
    for (let col = -nCols; col <= nCols; col++) {
      const x = col * spacing + xOff;
      if (Math.abs(x) > maxX + 1e-9) continue;
      cells.push(hex.translate(x, row * dy));
    }
  }
  if (cells.length === 0) cells.push(hex);
  return CrossSection.union(cells);
}

/** Builds a through-wall vent pattern cutout (slots or honeycomb) for a vent feature. */
export function buildVentCutout(
  wasm: ManifoldToplevel,
  feature: Feature,
  geom: BodyGeometry,
  wallThickness: number,
): Manifold {
  const spec = feature.vent;
  if (!spec) throw new Error('vent feature is missing its vent spec');
  const cross = ventCrossSection(wasm, spec).rotate(feature.rotationDeg);
  return extrudeThroughWall(cross, feature, geom, wallThickness);
}

/** One floor-standing standoff solid (boss + screw pilot bore) centered at world (x, y). */
function standoffAt(
  wasm: ManifoldToplevel,
  spec: NonNullable<Feature['standoff']>,
  x: number,
  y: number,
  wallThickness: number,
): Manifold {
  const floorZ = wallThickness;
  const height = Math.max(spec.height, 1);
  const boss = cylinderZ(wasm, spec.outerDiameter, height, floorZ).translate(x, y, 0);
  const boreStart = Math.max(floorZ - 0.5, 0);
  const bore = cylinderZ(wasm, spec.screwHoleDiameter, floorZ + height - boreStart + 0.5, boreStart).translate(
    x,
    y,
    0,
  );
  return boss.subtract(bore);
}

/** Builds a floor-mounted standoff (boss + screw pilot bore) for a standoff feature. Always rises from the base floor. */
export function buildStandoff(
  wasm: ManifoldToplevel,
  feature: Feature,
  geom: BodyGeometry,
  wallThickness: number,
): Manifold {
  const spec = feature.standoff;
  if (!spec) throw new Error('standoff feature is missing its standoff spec');
  const [x, y] = faceFrame('bottom', geom).toWorld(feature.u, feature.v);
  return standoffAt(wasm, spec, x, y, wallThickness);
}

/**
 * Rotation taking a solid built in the local frame (X = the face's u axis, Y = its v axis, Z = its
 * outward normal) into world orientation. orientAlongFace above only has to get the extrusion
 * *axis* right -- cutout solids are symmetric about their own origin, so the sign never matters --
 * but an external mount is one-sided, so "outward" has to come out with the correct sign on every
 * face. On the faces whose (u, v, n) frame is left-handed (back, left, bottom) no pure rotation can
 * match all three axes at once; those flip v instead, which is invisible here because the mount
 * geometry is symmetric in v -- its only asymmetric axis is the outward normal.
 */
function orientOutward(solid: Manifold, face: Face, u: number): Manifold {
  switch (face) {
    case 'top':
      return solid;
    case 'bottom':
      return solid.rotate(180, 0, 0);
    case 'front':
      return solid.rotate(90, 0, 0);
    case 'back':
      return solid.rotate(-90, 0, 0);
    case 'right':
      return solid.rotate(90, 0, 0).rotate(0, 0, 90);
    case 'left':
      return solid.rotate(-90, 0, 0).rotate(0, 0, 90);
    case 'side':
      return solid.rotate(90, 0, 0).rotate(0, 0, 90 + u * 360);
  }
}

/** Hole through a flange, drawn in the plate's own plane: X across the ear, Y outward from the
 * wall. A slot runs along Y so the screw position is adjustable in and out; a keyhole puts its
 * clearance circle at the ear's tip with the neck running back toward the case, so the case drops
 * over the screw heads and slides inward to trap them. */
function flangeHoleCrossSection(
  wasm: ManifoldToplevel,
  spec: ExternalMountSpec,
  holeCenterY: number,
): CrossSection | null {
  const { CrossSection } = wasm;
  const d = Math.max(spec.holeDiameter, 0.5);
  if (spec.hole === 'none') return null;
  if (spec.hole === 'round') return CrossSection.circle(d / 2).translate(0, holeCenterY);

  // slotLength is the opening's overall length, so the swept centerline is that minus one hole
  // diameter (half a round end at each tip).
  const travel = Math.max(spec.slotLength - d, 0.1);
  if (spec.hole === 'slot') {
    return CrossSection.square([0.01, travel], true)
      .offset(d / 2, 'Round')
      .translate(0, holeCenterY);
  }

  const neck = Math.max(d * 0.55, 0.5);
  const head = CrossSection.circle(d / 2).translate(0, holeCenterY + travel / 2);
  const slot = CrossSection.square([0.01, travel], true)
    .offset(neck / 2, 'Round')
    .translate(0, holeCenterY);
  return head.add(slot);
}

/** Flat ear standing out from a face (wall-mount tab), built in its own natural frame: X across the
 * ear, Y outward, Z through the plate's thickness. `embed` sinks its root into the wall so the
 * union always welds instead of just touching. */
function flangeSolid(
  wasm: ManifoldToplevel,
  spec: ExternalMountSpec,
  wallThickness: number,
): Manifold {
  const width = Math.max(spec.width, 1);
  const protrusion = Math.max(spec.protrusion, 1);
  const thickness = Math.max(spec.thickness, 0.8);
  const embed = Math.max(wallThickness, 0.4);

  const plate = wasm.Manifold.cube([width, protrusion + embed, thickness], true).translate(
    0,
    (protrusion - embed) / 2,
    0,
  );
  const hole = flangeHoleCrossSection(wasm, spec, protrusion / 2);
  if (!hole) return plate;
  return plate.subtract(hole.extrude(thickness + 2, undefined, undefined, undefined, true));
}

/** Cylindrical post along the face's outward normal -- an external standoff: a foot under the base,
 * a spacer column on the lid, a bolt-down pillar on a wall. */
function bossSolid(
  wasm: ManifoldToplevel,
  spec: ExternalMountSpec,
  wallThickness: number,
): Manifold {
  const diameter = Math.max(spec.width, 1);
  const protrusion = Math.max(spec.protrusion, 1);
  const embed = Math.max(wallThickness, 0.4);
  const post = cylinderZ(wasm, diameter, protrusion + embed, -embed);
  if (spec.hole === 'none') return post;

  const holeDiameter = Math.min(Math.max(spec.holeDiameter, 0.5), diameter - 0.8);
  // A blind hole is measured down from the outer end; without one it is drilled all the way
  // through the post and the wall behind it.
  const depth = spec.holeDepth !== undefined ? Math.max(spec.holeDepth, 0.5) : protrusion + embed + 1;
  const bore = cylinderZ(wasm, holeDiameter, depth + 0.5, protrusion - depth);
  return post.subtract(bore);
}

/** Builds an external mount (flange ear or boss), positioned and oriented on its face. Unlike every
 * other feature primitive this one is additive -- the caller unions it into the part that owns that
 * patch of the face. */
export function buildExternalMount(
  wasm: ManifoldToplevel,
  feature: Feature,
  geom: BodyGeometry,
  wallThickness: number,
): Manifold {
  const spec = feature.mount;
  if (!spec) throw new Error('external-mount feature is missing its mount spec');

  const local =
    spec.style === 'boss'
      ? bossSolid(wasm, spec, wallThickness)
      : flangeSolid(wasm, spec, wallThickness).rotate(90, 0, 0);
  const spun = feature.rotationDeg ? local.rotate(0, 0, feature.rotationDeg) : local;
  const [x, y, z] = faceFrame(feature.face, geom).toWorld(feature.u, feature.v);
  return orientOutward(spun, feature.face, feature.u).translate(x, y, z);
}

/** Builds a board-mount feature: one standoff per mounting hole, the whole pattern positioned at
 * the feature's floor location and spun about it by rotationDeg. The board outline itself is a
 * viewport-only ghost (never part of the printed geometry). */
export function buildBoardMount(
  wasm: ManifoldToplevel,
  feature: Feature,
  geom: BodyGeometry,
  wallThickness: number,
): Manifold {
  const board = feature.board;
  if (!board) throw new Error('board-mount feature is missing its board spec');

  const [cx, cy] = faceFrame('bottom', geom).toWorld(feature.u, feature.v);
  const theta = (feature.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const standoffs = board.holes.map(({ x, y }) =>
    standoffAt(wasm, board.standoff, cx + x * cos - y * sin, cy + x * sin + y * cos, wallThickness),
  );
  if (standoffs.length === 0) {
    return standoffAt(wasm, board.standoff, cx, cy, wallThickness);
  }
  return wasm.Manifold.union(standoffs);
}
