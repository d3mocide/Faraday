import type { ArmedFeatureTemplate } from '../components/FeaturePalette';
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
