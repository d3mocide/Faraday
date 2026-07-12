import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { findConnector } from '../connectors/library';
import type { EnclosureProject } from '../types/project';
import { bodyGeometry } from './faceFrame';
import { buildConnectorCutout, buildCustomHole, buildStandoff, buildVentCutout } from './featurePrimitives';
import { effectiveSplitHeight, featureOnLid } from './lidSplit';
import {
  applyFrictionLipLid,
  applyFrictionLipLidCylinder,
  applyGasketChannelBox,
  applyGasketChannelCylinder,
  applyScrewBossLid,
  applyScrewBossLidCylinder,
  applySnapFitLid,
  applySnapFitLidCylinder,
  boxShell,
  cylinderShell,
  shrinkCornerStyle,
} from './primitives';

export type CsgQuality = 'live' | 'export';

export interface EnclosureResult {
  base: Manifold;
  lid: Manifold;
  splitHeight: number;
  outerHeight: number;
}

/**
 * Runs the full CSG pipeline described in the design doc: build the outer
 * shell, hollow it out, split it into base + lid, then apply lid mating
 * geometry. Caller owns the returned Manifolds and must .delete() them
 * (or rely on garbageCollectManifold + cleanup()) once meshes are extracted.
 */
export function generateEnclosure(
  wasm: ManifoldToplevel,
  project: EnclosureProject,
  quality: CsgQuality,
): EnclosureResult {
  wasm.setCircularSegments(quality === 'export' ? 64 : 20);

  const { body } = project;
  const height = body.outer.height;
  const wallThickness = Math.max(body.wallThickness, 0.4);
  const geom = bodyGeometry(body);

  let outerShape: Manifold;
  let innerShape: Manifold;
  let innerCornerStyle = body.shape === 'box' ? shrinkCornerStyle(body.cornerStyle, wallThickness) : undefined;
  let innerLength = 0;
  let innerWidth = 0;
  let innerDiameter = 0;

  if (body.shape === 'box') {
    const { length, width } = body.outer;
    outerShape = boxShell(wasm, length, width, height, body.cornerStyle);
    innerLength = Math.max(length - 2 * wallThickness, 1);
    innerWidth = Math.max(width - 2 * wallThickness, 1);
    const innerHeight = Math.max(height - 2 * wallThickness, 1);
    innerShape = boxShell(wasm, innerLength, innerWidth, innerHeight, innerCornerStyle!).translate(
      0,
      0,
      wallThickness,
    );
  } else {
    const { diameter } = body.outer;
    outerShape = cylinderShell(wasm, diameter, height);
    innerDiameter = Math.max(diameter - 2 * wallThickness, 1);
    const innerHeight = Math.max(height - 2 * wallThickness, 1);
    innerShape = cylinderShell(wasm, innerDiameter, innerHeight).translate(0, 0, wallThickness);
  }

  const hollowShell = outerShape.subtract(innerShape);

  const splitHeight = effectiveSplitHeight(body);
  const [lidRaw, baseRaw] = hollowShell.splitByPlane([0, 0, 1], splitHeight);

  let base = baseRaw;
  let lid = lidRaw;

  if (body.lid.type === 'screw-boss' && body.lid.screw) {
    if (body.shape === 'box') {
      ({ base, lid } = applyScrewBossLid(wasm, base, lid, {
        innerLength,
        innerWidth,
        splitHeight,
        outerHeight: height,
        screw: body.lid.screw,
      }));
    } else {
      ({ base, lid } = applyScrewBossLidCylinder(wasm, base, lid, {
        innerDiameter,
        splitHeight,
        outerHeight: height,
        screw: body.lid.screw,
      }));
    }
  } else if (body.lid.type === 'friction-lip') {
    if (body.shape === 'box') {
      lid = applyFrictionLipLid(wasm, lid, {
        innerLength,
        innerWidth,
        innerCornerStyle: innerCornerStyle!,
        splitHeight,
        wallThickness,
        wallGap: Math.max(body.lid.wallGap, 0),
      });
    } else {
      lid = applyFrictionLipLidCylinder(wasm, lid, {
        innerDiameter,
        splitHeight,
        wallThickness,
        wallGap: Math.max(body.lid.wallGap, 0),
      });
    }
  } else if (body.lid.type === 'snap-fit') {
    if (body.shape === 'box') {
      ({ base, lid } = applySnapFitLid(wasm, base, lid, {
        innerLength,
        innerWidth,
        splitHeight,
        wallThickness,
        wallGap: Math.max(body.lid.wallGap, 0),
      }));
    } else {
      ({ base, lid } = applySnapFitLidCylinder(wasm, base, lid, {
        innerDiameter,
        splitHeight,
        wallThickness,
        wallGap: Math.max(body.lid.wallGap, 0),
      }));
    }
  }

  // Gasket channel (Phase 5 stretch, DESIGN.md §13): independent of lid.type, so it's applied
  // after the lid-mating branch above rather than folded into each one.
  if (body.lid.gasket) {
    if (body.shape === 'box') {
      base = applyGasketChannelBox(wasm, base, {
        length: body.outer.length,
        width: body.outer.width,
        cornerStyle: body.cornerStyle,
        wallThickness,
        splitHeight,
        gasket: body.lid.gasket,
      });
    } else {
      base = applyGasketChannelCylinder(wasm, base, {
        diameter: body.outer.diameter,
        wallThickness,
        splitHeight,
        gasket: body.lid.gasket,
      });
    }
  }

  // Apply per-face features (Section 7 step 5). Subtractive features (cutouts, vents, custom
  // holes) target whichever piece the split assigns them to; standoffs always union to the base.
  for (const feature of project.features) {
    let cutout: Manifold | null = null;
    if (feature.type === 'connector-cutout' && feature.connectorId) {
      const entry = findConnector(feature.connectorId);
      if (entry) cutout = buildConnectorCutout(wasm, entry, feature, geom, wallThickness);
    } else if (feature.type === 'vent' && feature.vent) {
      cutout = buildVentCutout(wasm, feature, geom, wallThickness);
    } else if (feature.type === 'custom-hole' && feature.custom) {
      cutout = buildCustomHole(wasm, feature, geom, wallThickness);
    } else if (feature.type === 'standoff' && feature.standoff) {
      base = base.add(buildStandoff(wasm, feature, geom, wallThickness));
    }

    if (cutout) {
      if (featureOnLid(feature, body)) {
        lid = lid.subtract(cutout);
      } else {
        base = base.subtract(cutout);
      }
    }
  }

  return { base, lid, splitHeight, outerHeight: height };
}

/**
 * Prepares the lid for standalone printing: flips it so the open (mating)
 * face points up and rests the piece back on the Z=0 print bed.
 */
export function orientLidForPrint(lid: Manifold, splitHeight: number, outerHeight: number): Manifold {
  const lidHeight = outerHeight - splitHeight;
  return lid.translate(0, 0, -splitHeight).rotate(180, 0, 0).translate(0, 0, lidHeight);
}
