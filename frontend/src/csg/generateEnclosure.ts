import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { findConnector } from '../connectors/library';
import type { EnclosureProject, PanelFace } from '../types/project';
import { bodyGeometry } from './faceFrame';
import {
  buildBoardMount,
  buildConnectorCutout,
  buildCustomHole,
  buildExternalMount,
  buildFanMount,
  buildStandoff,
  buildSupportPad,
  buildVentCutout,
} from './featurePrimitives';
import { effectiveSplitHeight } from './lidSplit';
import { orientPanelForPrint, panelChannelCut, panelPlate } from './panels';
import { featurePart, panelMetrics, panelPartId, partLabel, type PartId } from './parts';
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

export type PartKind = 'base' | 'lid' | 'panel';

/** One printed piece. A plain enclosure yields two (base + lid); each slide-in panel adds one. */
export interface EnclosurePart {
  id: PartId;
  label: string;
  kind: PartKind;
  /** Which wall this piece replaces -- panels only. */
  face?: PanelFace;
  manifold: Manifold;
}

export interface EnclosureResult {
  parts: EnclosurePart[];
  splitHeight: number;
  outerHeight: number;
}

/**
 * Runs the full CSG pipeline described in the design doc: build the outer
 * shell, hollow it out, split it into base + lid, then apply lid mating
 * geometry, then (if the body has slide-in panels) cut their channels and
 * build each plate. Caller owns the returned Manifolds and must .delete() them
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
        outerLength: body.outer.length,
        outerWidth: body.outer.width,
        wallThickness,
        splitHeight,
        outerHeight: height,
        screw: body.lid.screw,
      }));
    } else {
      ({ base, lid } = applyScrewBossLidCylinder(wasm, base, lid, {
        innerDiameter,
        wallThickness,
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

  // Slide-in panels: cut each plate's channel *after* the lid mating geometry, so a screw boss or
  // friction lip can never end up blocking the slot the plate has to slide down. The plate itself
  // is trimmed against the (pre-hollowing) outer shell so its ends follow the body's corner style.
  const metrics = panelMetrics(body);
  const panels = new Map<PanelFace, Manifold>();
  if (metrics && body.shape === 'box') {
    const dims = { length: body.outer.length, width: body.outer.width };
    for (const face of metrics.faces) {
      base = base.subtract(
        panelChannelCut(wasm, dims, metrics, face, metrics.channelBottomZ, splitHeight + 1),
      );
      if (metrics.lidCaptureDepth > 0) {
        lid = lid.subtract(
          // The lid's pocket is plain full-depth: its job is to stop the plate lifting, and a
          // retaining lip hanging off the lid would be a fragile tab for no gain.
          panelChannelCut(
            wasm,
            dims,
            metrics,
            face,
            splitHeight,
            splitHeight + metrics.lidCaptureDepth,
            false,
          ),
        );
      }
      panels.set(face, panelPlate(wasm, dims, metrics, face, outerShape));
    }
  }

  // Apply per-face features (Section 7 step 5). Subtractive features (cutouts, vents, custom
  // holes) and additive external mounts target whichever piece owns that patch of the face --
  // base, lid, or a slide-in panel (see featurePart). Standoffs and board mounts always union to
  // the base floor.
  const subtractFrom = (part: PartId, solid: Manifold) => {
    if (part === 'lid') lid = lid.subtract(solid);
    else if (part === 'base') base = base.subtract(solid);
    else {
      const face = part.slice('panel-'.length) as PanelFace;
      const plate = panels.get(face);
      if (plate) panels.set(face, plate.subtract(solid));
    }
  };
  const addTo = (part: PartId, solid: Manifold) => {
    if (part === 'lid') lid = lid.add(solid);
    else if (part === 'base') base = base.add(solid);
    else {
      const face = part.slice('panel-'.length) as PanelFace;
      const plate = panels.get(face);
      if (plate) panels.set(face, plate.add(solid));
    }
  };

  for (const feature of project.features) {
    if (feature.hidden) continue;
    if (feature.type === 'standoff' && feature.standoff) {
      base = base.add(buildStandoff(wasm, feature, geom, wallThickness));
      continue;
    }
    if (feature.type === 'board-mount' && feature.board) {
      base = base.add(buildBoardMount(wasm, feature, geom, wallThickness));
      continue;
    }
    if (feature.type === 'support-pad' && feature.pad) {
      base = base.add(buildSupportPad(wasm, feature, geom, wallThickness));
      continue;
    }
    if (feature.type === 'external-mount' && feature.mount) {
      const cornerRadius =
        body.shape === 'box' && body.cornerStyle.type !== 'sharp' ? body.cornerStyle.radius : 0;
      addTo(
        featurePart(feature, body),
        buildExternalMount(wasm, feature, geom, wallThickness, cornerRadius),
      );
      continue;
    }

    // A fan opening is both: bosses union in, then the same cut bores its screw holes through them.
    if (feature.type === 'fan-mount' && feature.fan) {
      const part = featurePart(feature, body);
      const { add, cut } = buildFanMount(wasm, feature, geom, wallThickness);
      if (add) addTo(part, add);
      subtractFrom(part, cut);
      continue;
    }

    let cutout: Manifold | null = null;
    if (feature.type === 'connector-cutout' && feature.connectorId) {
      const entry = findConnector(feature.connectorId);
      if (entry) cutout = buildConnectorCutout(wasm, entry, feature, geom, wallThickness);
    } else if (feature.type === 'vent' && feature.vent) {
      cutout = buildVentCutout(wasm, feature, geom, wallThickness);
    } else if (feature.type === 'custom-hole' && feature.custom) {
      cutout = buildCustomHole(wasm, feature, geom, wallThickness);
    }
    if (cutout) subtractFrom(featurePart(feature, body), cutout);
  }

  const parts: EnclosurePart[] = [
    { id: 'base', label: partLabel('base'), kind: 'base', manifold: base },
    { id: 'lid', label: partLabel('lid'), kind: 'lid', manifold: lid },
  ];
  for (const [face, manifold] of panels) {
    const id = panelPartId(face);
    parts.push({ id, label: partLabel(id), kind: 'panel', face, manifold });
  }

  return { parts, splitHeight, outerHeight: height };
}

/**
 * Prepares the lid for standalone printing: flips it so the open (mating)
 * face points up and rests the piece back on the Z=0 print bed.
 */
export function orientLidForPrint(lid: Manifold, splitHeight: number, outerHeight: number): Manifold {
  const lidHeight = outerHeight - splitHeight;
  return lid.translate(0, 0, -splitHeight).rotate(180, 0, 0).translate(0, 0, lidHeight);
}

/** Print-bed orientation for any part: the base stays as modelled, the lid flips, a panel lays
 * flat. Export only -- the live preview always shows parts in their assembled positions. */
export function orientPartForPrint(part: EnclosurePart, result: EnclosureResult): Manifold {
  if (part.kind === 'lid') return orientLidForPrint(part.manifold, result.splitHeight, result.outerHeight);
  if (part.kind === 'panel' && part.face) return orientPanelForPrint(part.manifold, part.face);
  return part.manifold;
}
