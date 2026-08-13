import type { Face, Feature } from '../types/project';
import { findConnector } from '../connectors/library';

export interface Feature2DBounds {
  id: string;
  type: Feature['type'];
  label: string;
  face: Face;
  centerU: number; // 0..1
  centerV: number; // 0..1
  centerMmU: number; // mm from left/center
  centerMmV: number; // mm from bottom/center
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  hidden: boolean;
  locked: boolean;
  feature: Feature;
}

export function getFeature2DBounds(feature: Feature, geomSizeU: number, geomSizeV: number): Feature2DBounds {
  let widthMm = 10;
  let heightMm = 10;

  if (feature.type === 'connector-cutout' && feature.connectorId) {
    const entry = findConnector(feature.connectorId);
    if (entry) {
      if (entry.holeShape === 'circle' || entry.holeShape === 'dshape') {
        const dia = feature.connectorOverride?.diameter ?? entry.diameter ?? 10;
        widthMm = dia;
        heightMm = dia;
      } else {
        widthMm = feature.connectorOverride?.width ?? entry.width ?? 10;
        heightMm = feature.connectorOverride?.height ?? entry.height ?? 10;
      }
    }
  } else if (feature.type === 'vent' && feature.vent) {
    widthMm = feature.vent.areaWidth;
    heightMm = feature.vent.areaHeight;
  } else if (feature.type === 'custom-hole' && feature.custom) {
    widthMm = feature.custom.width;
    heightMm = feature.custom.height ?? feature.custom.width;
  } else if (feature.type === 'standoff' && feature.standoff) {
    widthMm = feature.standoff.outerDiameter;
    heightMm = feature.standoff.outerDiameter;
  } else if (feature.type === 'fan-mount' && feature.fan) {
    widthMm = feature.fan.size;
    heightMm = feature.fan.size;
  } else if (feature.type === 'support-pad' && feature.pad) {
    widthMm = feature.pad.width;
    heightMm = feature.pad.depth;
  } else if (feature.type === 'grip-ribs' && feature.ribs) {
    widthMm = feature.ribs.span;
    heightMm = feature.ribs.count * (feature.ribs.width + feature.ribs.spacing);
  } else if (feature.type === 'external-mount' && feature.mount) {
    widthMm = feature.mount.width;
    heightMm = feature.mount.protrusion;
  }

  const centerMmU = (feature.u - 0.5) * geomSizeU;
  const centerMmV = (feature.v - 0.5) * geomSizeV;

  return {
    id: feature.id,
    type: feature.type,
    label: feature.type,
    face: feature.face,
    centerU: feature.u,
    centerV: feature.v,
    centerMmU,
    centerMmV,
    widthMm,
    heightMm,
    rotationDeg: feature.rotationDeg,
    hidden: !!feature.hidden,
    locked: !!feature.locked,
    feature,
  };
}

export function computeSmartSnap(
  targetU: number,
  targetV: number,
  sizeU: number,
  sizeV: number,
  otherFeatures: Feature2DBounds[],
  snapDistanceMm = 2.0
): { nextU: number; nextV: number; activeGuideLines: { axis: 'u' | 'v'; posMm: number; label: string }[] } {
  let nextU = targetU;
  let nextV = targetV;
  const targetMmU = (targetU - 0.5) * sizeU;
  const targetMmV = (targetV - 0.5) * sizeV;

  const activeGuideLines: { axis: 'u' | 'v'; posMm: number; label: string }[] = [];

  // Snap to Face Centerlines (U=0, V=0)
  if (Math.abs(targetMmU) < snapDistanceMm) {
    nextU = 0.5;
    activeGuideLines.push({ axis: 'u', posMm: 0, label: 'Center U (0mm)' });
  }
  if (Math.abs(targetMmV) < snapDistanceMm) {
    nextV = 0.5;
    activeGuideLines.push({ axis: 'v', posMm: 0, label: 'Center V (0mm)' });
  }

  // Snap to other features' U and V centerlines
  for (const feat of otherFeatures) {
    if (feat.hidden) continue;
    if (Math.abs(targetMmU - feat.centerMmU) < snapDistanceMm) {
      nextU = 0.5 + feat.centerMmU / sizeU;
      activeGuideLines.push({ axis: 'u', posMm: feat.centerMmU, label: `Aligned U (${feat.centerMmU.toFixed(1)}mm)` });
    }
    if (Math.abs(targetMmV - feat.centerMmV) < snapDistanceMm) {
      nextV = 0.5 + feat.centerMmV / sizeV;
      activeGuideLines.push({ axis: 'v', posMm: feat.centerMmV, label: `Aligned V (${feat.centerMmV.toFixed(1)}mm)` });
    }
  }

  return { nextU, nextV, activeGuideLines };
}
