import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { findConnector } from '../connectors/library';
import type { EnclosureProject } from '../types/project';
import { faceFrame } from './faceFrame';
import { buildConnectorCutout, buildStandoff } from './featurePrimitives';
import {
  applyFrictionLipLid,
  applyScrewBossLid,
  boxShell,
  shrinkCornerStyle,
} from './primitives';

export type CsgQuality = 'live' | 'export';

export interface EnclosureResult {
  base: Manifold;
  lid: Manifold;
  splitHeight: number;
  outerHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
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
  const { length, width, height } = body.outer;
  const wallThickness = Math.max(body.wallThickness, 0.4);

  const outerShape = boxShell(wasm, length, width, height, body.cornerStyle);

  const innerCornerStyle = shrinkCornerStyle(body.cornerStyle, wallThickness);
  const innerLength = Math.max(length - 2 * wallThickness, 1);
  const innerWidth = Math.max(width - 2 * wallThickness, 1);
  const innerHeight = Math.max(height - 2 * wallThickness, 1);
  const innerShape = boxShell(wasm, innerLength, innerWidth, innerHeight, innerCornerStyle).translate(
    0,
    0,
    wallThickness,
  );

  const hollowShell = outerShape.subtract(innerShape);

  const splitHeight = clamp(body.lid.splitHeight, wallThickness + 1, height - wallThickness - 1);
  const [lidRaw, baseRaw] = hollowShell.splitByPlane([0, 0, 1], splitHeight);

  let base = baseRaw;
  let lid = lidRaw;

  if (body.lid.type === 'screw-boss' && body.lid.screw) {
    ({ base, lid } = applyScrewBossLid(wasm, base, lid, {
      innerLength,
      innerWidth,
      splitHeight,
      outerHeight: height,
      screw: body.lid.screw,
    }));
  } else if (body.lid.type === 'friction-lip') {
    lid = applyFrictionLipLid(wasm, lid, {
      innerLength,
      innerWidth,
      innerCornerStyle,
      splitHeight,
      wallThickness,
      wallGap: Math.max(body.lid.wallGap, 0),
    });
  }
  // 'snap-fit' is a stretch-goal lid type (Section 7 / Phase 5) and is not
  // implemented yet; it falls back to the plain split shell.

  // Apply per-face features (Section 7 step 5). 'vent' and 'custom-hole' aren't wired up yet --
  // nothing in the UI creates them yet either, see PROGRESS.md.
  for (const feature of project.features) {
    if (feature.type === 'connector-cutout' && feature.connectorId) {
      const entry = findConnector(feature.connectorId);
      if (!entry) continue;
      const cutout = buildConnectorCutout(wasm, entry, feature, body.outer, wallThickness);
      if (feature.face === 'top') {
        lid = lid.subtract(cutout);
      } else if (feature.face === 'bottom') {
        base = base.subtract(cutout);
      } else {
        const featureZ = faceFrame(feature.face, body.outer).toWorld(feature.u, feature.v)[2];
        if (featureZ > splitHeight) {
          lid = lid.subtract(cutout);
        } else {
          base = base.subtract(cutout);
        }
      }
    } else if (feature.type === 'standoff' && feature.standoff) {
      // Standoffs always mount to the base floor, regardless of the split height.
      base = base.add(buildStandoff(wasm, feature, body.outer, wallThickness));
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
