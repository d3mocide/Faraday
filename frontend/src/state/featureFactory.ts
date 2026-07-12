import type { ArmedFeatureTemplate } from '../components/FeaturePalette';
import type { EnclosureProject, Face, Feature } from '../types/project';

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
    const { wallThickness, lid } = project.body;
    const height = Math.max(Math.min(10, lid.splitHeight - wallThickness - 2), 2);
    return {
      id,
      type: 'standoff',
      face: 'bottom',
      u,
      v,
      rotationDeg: 0,
      standoff: { outerDiameter: 6, screwHoleDiameter: 2.5, height },
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
