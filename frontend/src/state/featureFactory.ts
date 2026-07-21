import type { ArmedFeatureTemplate } from '../components/FeaturePalette';
import { findBoardMountPreset } from '../presets/boardMounts';
import type { BoardPreset } from '../presets/boards';
import type { EnclosureProject, Face, Feature } from '../types/project';

/** The classic 4-corner mounting pattern: holes inset from each board corner by `inset` mm. */
export function cornerHolePattern(
  boardWidth: number,
  boardDepth: number,
  inset: number,
): Array<{ x: number; y: number }> {
  const hx = boardWidth / 2 - inset;
  const hy = boardDepth / 2 - inset;
  return [
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
    { x: -hx, y: hy },
    { x: hx, y: hy },
  ];
}

function defaultStandoffHeight(project: EnclosureProject): number {
  const { wallThickness, lid } = project.body;
  return Math.max(Math.min(10, lid.splitHeight - wallThickness - 2), 2);
}

/** Expands a board preset into the features applying it should place: the centered board-mount
 * (if any), plus one wall cutout per IO port. Port positions are stored board-relative in the
 * preset (`BoardIoCutout`), so this converts them to face (u,v) against the preset's own body
 * dims: horizontal via the face's u axis (u = x/l + 0.5 for front/back, y/w + 0.5 for left/right,
 * matching csg/faceFrame.ts), vertical from the board's top surface (floor + standoff + board).
 * A preset with `io` but no `boardMount` (e.g. a non-board "starter" preset like the sealed
 * outdoor node) has no board to measure from -- its ports are simply measured from the interior
 * floor instead, same `aboveBoardMm` field just re-anchored. */
export function buildPresetFeatures(preset: BoardPreset): Feature[] {
  if (!preset.boardMount && !preset.io?.length) return [];
  const features: Feature[] = [];
  if (preset.boardMount) {
    features.push({
      id: crypto.randomUUID(),
      type: 'board-mount',
      face: 'bottom',
      u: 0.5,
      v: 0.5,
      rotationDeg: 0,
      board: structuredClone(preset.boardMount),
    });
  }

  const { length, width, height } = preset.body.outer;
  const boardTopZ = preset.boardMount
    ? preset.body.wallThickness + preset.boardMount.standoff.height + preset.boardMount.boardThickness
    : preset.body.wallThickness;
  for (const port of preset.io ?? []) {
    const uExtent = port.face === 'left' || port.face === 'right' ? width : length;
    features.push({
      id: crypto.randomUUID(),
      type: port.connectorId ? 'connector-cutout' : 'custom-hole',
      face: port.face,
      u: 0.5 + port.alongMm / uExtent,
      v: (boardTopZ + port.aboveBoardMm) / height,
      rotationDeg: 0,
      connectorId: port.connectorId,
      custom: port.custom ? structuredClone(port.custom) : undefined,
    });
  }
  return features;
}

/** Turns an armed palette template plus a viewport click into a placeable Feature. */
export function buildFeatureFromTemplate(
  template: ArmedFeatureTemplate,
  face: Face,
  u: number,
  v: number,
  project: EnclosureProject,
): Feature {
  const id = crypto.randomUUID();

  if (template.type === 'standoff') {
    return {
      id,
      type: 'standoff',
      face: 'bottom',
      u,
      v,
      rotationDeg: 0,
      standoff: { outerDiameter: 6, screwHoleDiameter: 2.5, height: defaultStandoffHeight(project) },
    };
  }

  if (template.type === 'board-mount') {
    const preset = template.boardPresetId ? findBoardMountPreset(template.boardPresetId) : undefined;
    if (preset) {
      // Clone so the placed feature never shares nested holes/standoff objects with the library
      // entry (same precedent as cloneFeatureAt in alignMirror.ts).
      return {
        id,
        type: 'board-mount',
        face: 'bottom',
        u,
        v,
        rotationDeg: 0,
        board: structuredClone(preset.mount),
      };
    }
    const boardWidth = 50;
    const boardDepth = 40;
    return {
      id,
      type: 'board-mount',
      face: 'bottom',
      u,
      v,
      rotationDeg: 0,
      board: {
        boardWidth,
        boardDepth,
        boardThickness: 1.6,
        holes: cornerHolePattern(boardWidth, boardDepth, 3.5),
        standoff: {
          outerDiameter: 6,
          screwHoleDiameter: 2.2,
          height: Math.min(defaultStandoffHeight(project), 4),
        },
      },
    };
  }

  if (template.type === 'vent') {
    return {
      id,
      type: 'vent',
      face,
      u,
      v,
      rotationDeg: 0,
      vent: { pattern: 'slots', areaWidth: 30, areaHeight: 20, slotWidth: 2, slotSpacing: 5 },
    };
  }

  if (template.type === 'custom-hole') {
    return {
      id,
      type: 'custom-hole',
      face,
      u,
      v,
      rotationDeg: 0,
      custom: { shape: 'circle', width: 8 },
    };
  }

  return {
    id,
    type: 'connector-cutout',
    face,
    u,
    v,
    rotationDeg: 0,
    connectorId: template.connectorId,
  };
}
