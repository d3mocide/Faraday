import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { ConnectorLibraryEntry, Face, Feature } from '../types/project';
import { faceFrame, type OuterDimensions } from './faceFrame';
import { cylinderZ } from './primitives';

function connectorCrossSection(wasm: ManifoldToplevel, entry: ConnectorLibraryEntry): CrossSection {
  const { CrossSection } = wasm;
  // 'dshape' (flat-sided D connector) has no geometry of its own yet -- no starter-library
  // entry uses it (see connectors/library.ts) -- and falls back to the nearest available
  // primitive, the same documented-fallback pattern as the 'snap-fit' lid type (see PROGRESS.md).
  const shape = entry.holeShape === 'dshape' ? (entry.diameter != null ? 'circle' : 'rect') : entry.holeShape;

  if (shape === 'rect') {
    const width = entry.width ?? 5;
    const height = entry.height ?? 5;
    const radius = Math.min(entry.cornerRadius ?? 0, Math.min(width, height) / 2 - 0.01);
    if (radius <= 0) return CrossSection.square([width, height], true);
    return CrossSection.square([width - 2 * radius, height - 2 * radius], true).offset(radius, 'Round');
  }

  const diameter = entry.diameter ?? 5;
  return CrossSection.circle(diameter / 2);
}

/**
 * Extrusion runs along local Z, centered on the origin (via extrude's `center` option), so it's
 * unaffected by which rotation sign correctly maps Z to a given face's outward normal -- it
 * always spans equally through the wall on both sides of the face regardless.
 */
function orientAlongFace(solid: Manifold, face: Face): Manifold {
  switch (face) {
    case 'top':
    case 'bottom':
      return solid;
    case 'front':
    case 'back':
      return solid.rotate(90, 0, 0);
    case 'left':
    case 'right':
      return solid.rotate(0, 90, 0);
  }
}

/** Builds a through-wall cutout primitive for a connector-cutout feature, positioned in world space. */
export function buildConnectorCutout(
  wasm: ManifoldToplevel,
  entry: ConnectorLibraryEntry,
  feature: Feature,
  outer: OuterDimensions,
  wallThickness: number,
): Manifold {
  const cross = connectorCrossSection(wasm, entry).rotate(feature.rotationDeg);
  const depth = wallThickness + 4; // margin so it fully punches through any wall thickness
  const solid = orientAlongFace(cross.extrude(depth, undefined, undefined, undefined, true), feature.face);
  const [x, y, z] = faceFrame(feature.face, outer).toWorld(feature.u, feature.v);
  return solid.translate(x, y, z);
}

/** Builds a floor-mounted standoff (boss + screw pilot bore) for a standoff feature. Always rises from the base floor. */
export function buildStandoff(
  wasm: ManifoldToplevel,
  feature: Feature,
  outer: OuterDimensions,
  wallThickness: number,
): Manifold {
  const spec = feature.standoff;
  if (!spec) throw new Error('standoff feature is missing its standoff spec');

  const [x, y] = faceFrame('bottom', outer).toWorld(feature.u, feature.v);
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
