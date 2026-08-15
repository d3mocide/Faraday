import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type {
  ConnectorLibraryEntry,
  ConnectorSizeOverride,
  ExternalMountSpec,
  Face,
  FanMountSpec,
  Feature,
  VentSpec,
} from '../types/project';
import { cornerAnchor, faceFrame, polygonFacetAngleDeg, supportPadPositions, type BodyGeometry } from './faceFrame';
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
 *
 * `geom` disambiguates the polygon-facet and wedge-slope cases, which have no fixed orientation
 * -- a hexagon's f1 and an octagon's f1 point different directions, and the slope angle depends
 * on the wedge's own front/back heights.
 */
function orientAlongFace(solid: Manifold, face: Face, u: number, geom: BodyGeometry): Manifold {
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
    case 'f1':
    case 'f2':
    case 'f3':
    case 'f4':
    case 'f5':
    case 'f6':
    case 'f7':
    case 'f8': {
      // Same left/right-at-theta=0 frame as 'side' above, spun to this facet's own outward angle.
      if (geom.shape !== 'hexagon' && geom.shape !== 'octagon') return solid.rotate(90, 0, 0);
      const angleDeg = polygonFacetAngleDeg(face, geom.shape);
      return solid.rotate(90, 0, 0).rotate(0, 0, 90 + angleDeg);
    }
    case 'slanted-top': {
      if (geom.shape !== 'wedge') return solid.rotate(90, 0, 0);
      // Tilt local Z (extrusion axis) from straight-up toward the slope's own outward normal --
      // local X stays world X (=u) throughout, matching faceFrame's slanted-top toWorld, so no
      // extra Z-spin is needed the way the facet/side cases above need one.
      const { heightFront: hF, heightBack: hB, width } = geom;
      const slopeDeg = (Math.atan2(hB - hF, width) * 180) / Math.PI;
      return solid.rotate(slopeDeg, 0, 0);
    }
    default:
      return solid.rotate(90, 0, 0);
  }
}

/** Extrudes a cross-section through the wall at the feature's position, oriented to its face. */
function extrudeThroughWall(
  cross: CrossSection,
  feature: Feature,
  geom: BodyGeometry,
  wallThickness: number,
  extraDepth = 0,
): Manifold {
  // Margin so it fully punches through any wall thickness; extraDepth covers anything standing
  // proud of the wall that the same cut has to clear (a fan's mounting bosses, say).
  const depth = wallThickness + 4 + 2 * extraDepth;
  const solid = orientAlongFace(
    cross.extrude(depth, undefined, undefined, undefined, true),
    feature.face,
    feature.u,
    geom,
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

/**
 * Concentric ring grille: open annular slots from the hub outward, held together by radial spokes
 * so the middle doesn't fall out. This is the grille profile from the CadQuery design the CM4
 * preset came from, generalized to any fan size — it prints cleanly on an FDM machine (every span
 * is a short bridge between two rings) and flows better than a honeycomb of the same open area.
 */
function fanGrilleCrossSection(wasm: ManifoldToplevel, spec: FanMountSpec): CrossSection {
  const { CrossSection } = wasm;
  const outerRadius = Math.max(spec.size / 2 - 1, 1);

  if (spec.grille === 'open') return CrossSection.circle(outerRadius);

  if (spec.grille === 'honeycomb') {
    const area = outerRadius * 2;
    const cell = Math.max(Math.min(spec.ringWidth * 1.6, area / 3), 1);
    return ventCrossSection(wasm, {
      pattern: 'honeycomb',
      areaWidth: area,
      areaHeight: area,
      slotWidth: cell,
      slotSpacing: cell + Math.max(spec.ringGap, 0.8),
    }).intersect(CrossSection.circle(outerRadius));
  }

  const hubRadius = Math.max(spec.hubDiameter, 0) / 2;
  const ringWidth = Math.max(spec.ringWidth, 0.5);
  const gap = Math.max(spec.ringGap, 0.5);
  const rings: CrossSection[] = [];

  let inner = hubRadius > 0 ? hubRadius + gap : gap;
  while (inner + ringWidth <= outerRadius) {
    rings.push(CrossSection.circle(inner + ringWidth).subtract(CrossSection.circle(inner)));
    inner += ringWidth + gap;
  }
  if (rings.length === 0) return CrossSection.circle(outerRadius);

  let grille = CrossSection.union(rings);
  // Spokes are cut back out of the open area, so each ring stays tied to its neighbours. Two
  // crossing bars make four spokes, three make six, and so on.
  const spokeCount = Math.max(Math.round(spec.spokeCount), 0);
  const bars = Math.floor(spokeCount / 2);
  const spokeWidth = Math.max(spec.spokeWidth, 0.4);
  for (let i = 0; i < bars; i++) {
    const bar = CrossSection.square([spokeWidth, outerRadius * 2 + 2], true).rotate((180 / bars) * i);
    grille = grille.subtract(bar);
  }
  // The hub goes back in *after* the spokes, or the spokes crossing the middle would fill it. Each
  // spoke arm is still tied to the rim through every ring bridge it crosses, so opening the centre
  // costs nothing structurally -- and it's how the design this grille came from does it.
  return hubRadius > 0 ? grille.add(CrossSection.circle(hubRadius)) : grille;
}

/** The four screw hole centers of a fan, on its own square bolt circle. */
function fanHolePositions(spec: FanMountSpec): Array<[number, number]> {
  const half = Math.max(spec.holePitch, 1) / 2;
  return [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ];
}

/**
 * Builds a fan opening: the grille plus its screw holes as one cut, and (optionally) raised bosses
 * on the *inside* face for the fan to screw against. Returns both halves because unlike every other
 * feature this one is neither purely additive nor purely subtractive -- the caller adds the bosses
 * to its target part, then subtracts the cut so the screw holes are bored through them too.
 */
export function buildFanMount(
  wasm: ManifoldToplevel,
  feature: Feature,
  geom: BodyGeometry,
  wallThickness: number,
): { add: Manifold | null; cut: Manifold } {
  const spec = feature.fan;
  if (!spec) throw new Error('fan-mount feature is missing its fan spec');

  const holeRadius = Math.max(spec.screwHoleDiameter, 0.5) / 2;
  const holes = fanHolePositions(spec).map(([hx, hy]) =>
    wasm.CrossSection.circle(holeRadius).translate(hx, hy),
  );
  const cross = wasm.CrossSection.union([fanGrilleCrossSection(wasm, spec), ...holes]).rotate(
    feature.rotationDeg,
  );

  const bossHeight = Math.max(spec.bossHeight, 0);
  // The cut has to clear the wall *and* whatever the bosses add behind it, so the screw holes come
  // out bored right through.
  const cut = extrudeThroughWall(cross, feature, geom, wallThickness, bossHeight + wallThickness / 2);
  if (bossHeight <= 0) return { add: null, cut };

  // Bosses grow along -Z in the local frame, i.e. inward from the face -- orientOutward puts local
  // +Z on the outward normal, so a solid spanning [-height, 0] lands inside the case. They start at
  // the *outer* surface and run through the wall, so `bossHeight` is what actually stands proud on
  // the inside (the part inside the wall just merges with it).
  const bossDiameter = Math.max(spec.screwHoleDiameter + 4, 4);
  const bossReach = bossHeight + wallThickness;
  let bosses: Manifold | null = null;
  for (const [hx, hy] of fanHolePositions(spec)) {
    const post = cylinderZ(wasm, bossDiameter, bossReach, -bossReach).translate(hx, hy, 0);
    bosses = bosses ? bosses.add(post) : post;
  }
  const [x, y, z] = faceFrame(feature.face, geom).toWorld(feature.u, feature.v);
  const spun = feature.rotationDeg ? bosses!.rotate(0, 0, feature.rotationDeg) : bosses!;
  return { add: orientOutward(spun, feature.face, feature.u, geom).translate(x, y, z), cut };
}

/**
 * Builds a support pad: a blind pillar standing on the interior floor, with no bore through it.
 * Always mounts to the floor regardless of which face the feature nominally carries, same rule as
 * a standoff.
 */
export function buildSupportPad(
  wasm: ManifoldToplevel,
  feature: Feature,
  geom: BodyGeometry,
  wallThickness: number,
): Manifold {
  const spec = feature.pad;
  if (!spec) throw new Error('support-pad feature is missing its pad spec');
  const height = Math.max(spec.height, 0.5);

  let solid: Manifold | null = null;
  for (const [x, y] of supportPadPositions(feature, geom)) {
    const pillar =
      spec.shape === 'round'
        ? cylinderZ(wasm, Math.max(spec.width, 1), height, wallThickness).translate(x, y, 0)
        : wasm.CrossSection.square([Math.max(spec.width, 1), Math.max(spec.depth, 1)], true)
            .rotate(feature.rotationDeg)
            .extrude(height)
            .translate(x, y, wallThickness);
    solid = solid ? solid.add(pillar) : pillar;
  }
  return solid!;
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
function orientOutward(solid: Manifold, face: Face, u: number, geom: BodyGeometry): Manifold {
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
    case 'f1':
    case 'f2':
    case 'f3':
    case 'f4':
    case 'f5':
    case 'f6':
    case 'f7':
    case 'f8': {
      if (geom.shape !== 'hexagon' && geom.shape !== 'octagon') return solid.rotate(90, 0, 0);
      const angleDeg = polygonFacetAngleDeg(face, geom.shape);
      return solid.rotate(90, 0, 0).rotate(0, 0, 90 + angleDeg);
    }
    case 'slanted-top': {
      if (geom.shape !== 'wedge') return solid;
      // Local +Z (the "outward" axis orientOutward's callers build along) tilts from straight up
      // toward the slope's own outward normal -- same rotation faceFrame's slanted-top normalAt
      // uses, so a boss/flange grown along it stands proud of the actual slope, not straight up
      // through it.
      const { heightFront: hF, heightBack: hB, width } = geom;
      const slopeDeg = (Math.atan2(hB - hF, width) * 180) / Math.PI;
      return solid.rotate(slopeDeg, 0, 0);
    }
    default:
      return solid.rotate(90, 0, 0);
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

/** A polygon, wound counter-clockwise whichever order the points arrive in -- a clockwise
 * SimplePolygon extrudes into an inside-out solid. */
function polygonCcw(wasm: ManifoldToplevel, points: Array<[number, number]>): CrossSection {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return new wasm.CrossSection(area < 0 ? [...points].reverse() : points);
}

function roundedRectCrossSection(
  wasm: ManifoldToplevel,
  width: number,
  height: number,
  radius: number,
): CrossSection {
  if (radius <= 0) return wasm.CrossSection.square([width, height], true);
  return wasm.CrossSection.square([Math.max(width - 2 * radius, 0.01), Math.max(height - 2 * radius, 0.01)], true).offset(
    radius,
    'Round',
  );
}

function flangeEdgeRadius(spec: ExternalMountSpec, width: number, profileHeight: number): number {
  const requested = Math.max(spec.edgeRadius ?? 0, 0);
  return Math.min(requested, Math.max(Math.min(width, profileHeight) / 2 - 0.01, 0));
}

function flangePlate(
  wasm: ManifoldToplevel,
  spec: ExternalMountSpec,
  embed: number,
): Manifold {
  const width = Math.max(spec.width, 1);
  const protrusion = Math.max(spec.protrusion, 1);
  const thickness = Math.max(spec.thickness, 0.8);
  const profileHeight = protrusion + embed;
  const radius = flangeEdgeRadius(spec, width, profileHeight);
  return roundedRectCrossSection(wasm, width, profileHeight, radius)
    .extrude(thickness, undefined, undefined, undefined, true)
    .translate(0, (protrusion - embed) / 2, 0);
}

function flangeWeb(
  wasm: ManifoldToplevel,
  spec: ExternalMountSpec,
  embed: number,
  size: number,
  side: 1 | -1,
  webWidth: number,
): Manifold | null {
  const halfThickness = Math.max(spec.thickness, 0.8) / 2;
  if (size < 0.5 || webWidth <= 0.01) return null;

  return polygonCcw(wasm, [
    [-embed, side * halfThickness],
    [size, side * halfThickness],
    [-embed, side * (halfThickness + size)],
  ])
    .extrude(webWidth)
    .translate(0, 0, -webWidth / 2)
    // Solid (x, y, z) -> natural (z, x, y): the sweep lands on X, the triangle on (Y, Z).
    .rotate(90, 0, 0)
    .rotate(0, 0, 90);
}

/**
 * Triangular webs bracing a flange back into the wall: one at each end of the ear, leaving the
 * middle clear so a screwdriver can still reach the hole. Built in the flange's natural frame
 * (X across the ear, Y outward, Z through its thickness) -- the triangle lives in the (Y, Z) plane
 * and is swept along X, hence the axis-cycling rotation at the end.
 */
function flangeWebs(
  wasm: ManifoldToplevel,
  spec: ExternalMountSpec,
  embed: number,
  size: number,
  side: 1 | -1,
): Manifold | null {
  const width = Math.max(spec.width, 1);
  const webWidth = Math.min(Math.max(width * 0.22, 1.6), 4);
  if (size < 0.5 || webWidth * 2 >= width) return null;
  const triangle = flangeWeb(wasm, spec, embed, size, side, webWidth);
  if (!triangle) return null;

  const offset = width / 2 - webWidth / 2;
  return triangle.translate(-offset, 0, 0).add(triangle.translate(offset, 0, 0));
}

function horizontalFaceFlangeWebs(
  wasm: ManifoldToplevel,
  spec: ExternalMountSpec,
  embed: number,
  size: number,
): Manifold | null {
  const width = Math.max(spec.width, 1);
  const top = flangeWeb(wasm, spec, embed, size, 1, width);
  const bottom = flangeWeb(wasm, spec, embed, size, -1, width);
  if (top && bottom) return top.add(bottom);
  return top ?? bottom;
}

/** Flat ear standing out from a face (wall-mount tab), built in its own natural frame: X across the
 * ear, Y outward, Z through the plate's thickness. `embed` sinks its root into the wall so the
 * union always welds instead of just touching. `webSide` is which way along *natural Z* the braces
 * go -- which is not always world-up: the face path rotates the natural frame twice on its way out,
 * landing natural +Z on world -Z, while the corner path leaves it alone. Both call sites resolve
 * that themselves, since only they know which way is up. */
function flangeSolid(
  wasm: ManifoldToplevel,
  spec: ExternalMountSpec,
  wallThickness: number,
  gusset: number,
  webSide: 1 | -1,
): Manifold {
  const protrusion = Math.max(spec.protrusion, 1);
  const thickness = Math.max(spec.thickness, 0.8);
  const embed = Math.max(wallThickness, 0.4);

  const plate = flangePlate(wasm, spec, embed);
  const hole = flangeHoleCrossSection(wasm, spec, protrusion / 2);
  // Webs are added after the hole is bored, so the bore (which runs a little past both faces)
  // can't take a bite out of them.
  const drilled = hole
    ? plate.subtract(hole.extrude(thickness + 2, undefined, undefined, undefined, true))
    : plate;
  const webs = flangeWebs(wasm, spec, embed, gusset, webSide);
  return webs ? drilled.add(webs) : drilled;
}

function horizontalFaceFlangeSolid(
  wasm: ManifoldToplevel,
  spec: ExternalMountSpec,
  wallThickness: number,
  gusset: number,
): Manifold {
  const protrusion = Math.max(spec.protrusion, 1);
  const thickness = Math.max(spec.thickness, 0.8);
  const embed = Math.max(wallThickness, 0.4);

  const plate = flangePlate(wasm, spec, embed);
  const hole = flangeHoleCrossSection(wasm, spec, protrusion / 2);
  const drilled = hole
    ? plate.subtract(hole.extrude(thickness + 2, undefined, undefined, undefined, true))
    : plate;
  const webs = horizontalFaceFlangeWebs(wasm, spec, embed, gusset);
  return webs ? drilled.add(webs) : drilled;
}

/** Corner ears need a V-shaped root, not a flat one: a flat strip only hits the case near the
 * middle of a diagonal corner mount, leaving its side edges floating away from the two walls.
 * This profile drives the root farther inward toward each wall as it moves across the ear's width,
 * so the whole bracket actually welds into both faces. */
function cornerFlangeSolid(
  wasm: ManifoldToplevel,
  spec: ExternalMountSpec,
  wallThickness: number,
  cornerInset: number,
): Manifold {
  const width = Math.max(spec.width, 1);
  const protrusion = Math.max(spec.protrusion, 1);
  const thickness = Math.max(spec.thickness, 0.8);
  const halfWidth = width / 2;
  const baseEmbed = Math.max(wallThickness + cornerInset + 0.2, 0.4);

  const plateProfile = polygonCcw(wasm, [
    [-halfWidth, protrusion],
    [halfWidth, protrusion],
    [halfWidth, -(baseEmbed + halfWidth)],
    [0, -baseEmbed],
    [-halfWidth, -(baseEmbed + halfWidth)],
  ]);
  const hole = flangeHoleCrossSection(wasm, spec, protrusion / 2);
  const plate = plateProfile.extrude(thickness, undefined, undefined, undefined, true);
  return hole ? plate.subtract(hole.extrude(thickness + 2, undefined, undefined, undefined, true)) : plate;
}

/** Cylindrical post along the face's outward normal -- an external standoff: a foot under the base,
 * a spacer column on the lid, a bolt-down pillar on a wall. */
function bossSolid(
  wasm: ManifoldToplevel,
  spec: ExternalMountSpec,
  wallThickness: number,
  gusset: number,
): Manifold {
  const diameter = Math.max(spec.width, 1);
  const protrusion = Math.max(spec.protrusion, 1);
  const embed = Math.max(wallThickness, 0.4);
  let post = cylinderZ(wasm, diameter, protrusion + embed, -embed);

  // Conical collar at the root: a 45-degree flare from the wall up to the post's own diameter, so
  // the joint has some meat in it instead of being a sharp step.
  if (gusset >= 0.5) {
    post = post.add(
      wasm.Manifold.cylinder(
        gusset + embed,
        diameter / 2 + gusset + embed,
        diameter / 2,
        0,
        false,
      ).translate(0, 0, -embed),
    );
  }
  if (spec.hole === 'none') return post;

  const holeDiameter = Math.min(Math.max(spec.holeDiameter, 0.5), diameter - 0.8);
  // A blind hole is measured down from the outer end; without one it is drilled all the way
  // through the post and the wall behind it.
  const depth = spec.holeDepth !== undefined ? Math.max(spec.holeDepth, 0.5) : protrusion + embed + 1;
  const bore = cylinderZ(wasm, holeDiameter, depth + 0.5, protrusion - depth);
  return post.subtract(bore);
}

/**
 * Which way a vertical-wall flange's natural +Z has to point for its braces to end up on world
 * `webSide`. The natural frame reaches the wall through two rotations (the `.rotate(90, 0, 0)` at
 * the call site, then orientOutward's own), and the pair does not compose the same way on every
 * face: front/right/side land natural +Z on world -Z, while back/left leave it on world +Z. Using
 * one sign for all of them puts the gussets under a back-wall mount that has no room below it,
 * which for a mount near the floor means a brace hanging past the bottom of the case.
 */
function naturalZAlongFace(face: Face, webSide: 1 | -1): 1 | -1 {
  const flipped = face === 'front' || face === 'right' || face === 'side';
  return (flipped ? -webSide : webSide) as 1 | -1;
}

/** How big the blend where a mount meets the wall should be. Defaults to something proportionate
 * to the mount and always stops short of its tip, so the brace never swallows the whole thing. */
function gussetSize(spec: ExternalMountSpec): number {
  const protrusion = Math.max(spec.protrusion, 1);
  const requested = spec.gusset ?? Math.min(protrusion * 0.45, 4);
  return Math.min(Math.max(requested, 0), protrusion - 0.5);
}

/** Builds an external mount (flange ear or boss), positioned and oriented on its face. Unlike every
 * other feature primitive this one is additive -- the caller unions it into the part that owns that
 * patch of the face. */
export function buildExternalMount(
  wasm: ManifoldToplevel,
  feature: Feature,
  geom: BodyGeometry,
  wallThickness: number,
  cornerRadius = 0,
  zSpan?: { min: number; max: number },
): Manifold {
  const spec = feature.mount;
  if (!spec) throw new Error('external-mount feature is missing its mount spec');

  const gusset = gussetSize(spec);
  const [mountX, mountY, mountZ] = faceFrame(feature.face, geom).toWorld(feature.u, feature.v);
  // Vertical-wall flanges should brace into whichever side of their *owning part* has room. Using
  // world Z alone makes lid-side mounts droop toward the base when the lid is exploded, because it
  // sees the room below the whole enclosure rather than the room inside the lid piece itself.
  const halfThickness = Math.max(spec.thickness, 0.8) / 2;
  const minZ = zSpan?.min ?? 0;
  const maxZ = zSpan?.max ?? (geom.shape === 'wedge' ? geom.heightBack : geom.height);
  const roomBelow = mountZ - minZ - halfThickness;
  const roomAbove = maxZ - mountZ - halfThickness;
  const webSide: 1 | -1 = roomBelow >= gusset + 0.5 && roomBelow >= roomAbove ? -1 : 1;

  const corner = cornerAnchor(feature, geom);
  if (corner) {
    // A corner mount keeps the natural frame's Z as world Z, so only the yaw changes. Flanges use
    // a V-shaped root because the two-case-wall corner is not a flat plane.
    const cornerInset = cornerRadius * (Math.SQRT2 - 1);
    const embed = wallThickness + cornerInset + 0.2;
    // Corner ears keep the natural frame's Z as world Z, so "above" means what it says.
    const solid =
      spec.style === 'boss'
        ? bossSolid(wasm, spec, embed, gusset).rotate(-90, 0, 0)
        : cornerFlangeSolid(wasm, spec, wallThickness, cornerInset);
    const yaw = corner.angleDeg - 90 + (feature.rotationDeg ?? 0);
    return solid.rotate(0, 0, yaw).translate(corner.x, corner.y, corner.z);
  }

  const local =
    spec.style === 'boss'
      ? bossSolid(wasm, spec, wallThickness, gusset)
      : feature.face === 'top' || feature.face === 'bottom'
        ? horizontalFaceFlangeSolid(wasm, spec, wallThickness, gusset).rotate(90, 0, 0)
      // The natural->local rotation below puts natural +Z on -v, so the brace side inverts here.
        : flangeSolid(wasm, spec, wallThickness, gusset, naturalZAlongFace(feature.face, webSide)).rotate(90, 0, 0);
  const spun = feature.rotationDeg ? local.rotate(0, 0, feature.rotationDeg) : local;
  return orientOutward(spun, feature.face, feature.u, geom).translate(mountX, mountY, mountZ);
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

/** Builds a grip-ribs feature: parallel recessed tactile grip slots cut into a wall face. */
export function buildGripRibs(
  wasm: ManifoldToplevel,
  feature: Feature,
  geom: BodyGeometry,
  wallThickness: number,
): Manifold {
  const { CrossSection } = wasm;
  const spec = feature.ribs ?? {
    count: 5,
    depth: 1.2,
    width: 2.0,
    spacing: 4.0,
    orientation: 'horizontal',
    span: 30,
  };

  const count = Math.max(Math.round(spec.count), 1);
  const depth = Math.min(Math.max(spec.depth, 0.4), wallThickness - 0.2);
  const slotW = Math.max(spec.width, 0.5);
  const pitch = Math.max(spec.spacing, slotW + 0.5);
  const span = Math.max(spec.span, 5);
  const radius = Math.min(slotW / 2 - 0.01, 2);

  let compoundCross: CrossSection | null = null;
  const totalOffset = (count - 1) * pitch;

  for (let i = 0; i < count; i++) {
    const offset = i * pitch - totalOffset / 2;
    const w = spec.orientation === 'horizontal' ? span : slotW;
    const h = spec.orientation === 'horizontal' ? slotW : span;
    const r = Math.min(radius, Math.min(w, h) / 2 - 0.01);

    const slotCross =
      r > 0
        ? CrossSection.square([Math.max(w - 2 * r, 0.1), Math.max(h - 2 * r, 0.1)], true).offset(r, 'Round')
        : CrossSection.square([w, h], true);

    const translatedSlot =
      spec.orientation === 'horizontal'
        ? slotCross.translate(0, offset)
        : slotCross.translate(offset, 0);

    compoundCross = compoundCross ? compoundCross.add(translatedSlot) : translatedSlot;
  }

  if (!compoundCross) compoundCross = CrossSection.square([span, slotW], true);

  const rotatedCross = compoundCross.rotate(feature.rotationDeg);
  const cutDepth = depth + 0.5;

  const slotSolid = orientAlongFace(
    rotatedCross.extrude(cutDepth, undefined, undefined, undefined, true),
    feature.face,
    feature.u,
    geom,
  );

  const [x, y, z] = faceFrame(feature.face, geom).toWorld(feature.u, feature.v);
  return slotSolid.translate(x, y, z);
}
