import type { EnclosureBody, Face, Feature, PanelFace } from '../types/project';
import { bodyGeometry, faceFrame } from './faceFrame';
import { effectiveSplitHeight } from './lidSplit';

/** Every printed piece an enclosure can produce. Panels are identified by the wall they replace. */
export type PartId = 'base' | 'lid' | `panel-${PanelFace}`;

export const PANEL_FACE_ORDER: PanelFace[] = ['front', 'back', 'left', 'right'];

export function panelPartId(face: PanelFace): PartId {
  return `panel-${face}`;
}

export function partLabel(id: PartId): string {
  if (id === 'base') return 'Base';
  if (id === 'lid') return 'Lid';
  const face = id.slice('panel-'.length);
  return `${face.charAt(0).toUpperCase()}${face.slice(1)} panel`;
}

/**
 * Panel dimensions the CSG, the viewport and the export all have to agree on, with every user
 * input already clamped to something buildable. Returns null when the body has no panels (a
 * cylinder, or a box with the feature switched off / no faces selected), which is the signal to
 * take the original single-piece code path everywhere.
 *
 * `grooveDepth` is capped so the channel never eats a wall or the floor completely: at most
 * `wallThickness - MIN_SKIN`, leaving that much material outboard of the groove to actually hold
 * the plate in.
 */
export interface PanelMetrics {
  faces: PanelFace[];
  /** Plate thickness (through-wall). */
  thickness: number;
  /** Total slop between plate and channel; half of it lands on each side. */
  clearance: number;
  grooveDepth: number;
  /** How deep the lid's own capture pocket actually is. Usually `grooveDepth`, but reduced (or
   * dropped to 0, meaning "no capture, the plate stops flush with the base rim") when the lid is
   * too shallow to take the full groove -- cutting past the lid's interior ceiling leaves a
   * razor-thin ledge there, which is a non-manifold pinch waiting to happen rather than a feature. */
  lidCaptureDepth: number;
  wallThickness: number;
  /** How far in from a corner the body's own corner treatment reaches (0 for sharp corners) --
   * where two panels meet, their ends have to stop clear of this or the corner post left between
   * them is a sliver of the rounded/chamfered arc rather than solid material. */
  cornerInset: number;
  splitHeight: number;
  /** World Z of the channel floor -- the plate's bottom edge sits `clearance/2` above this. */
  channelBottomZ: number;
  /** World Z span of the plate itself. */
  plateBottomZ: number;
  plateTopZ: number;
}

const MIN_PANEL_SKIN = 0.8; // mm of wall/floor left outboard of a groove

export function panelMetrics(body: EnclosureBody): PanelMetrics | null {
  if (body.shape !== 'box' || !body.panels || body.panels.faces.length === 0) return null;
  const spec = body.panels;
  const wallThickness = Math.max(body.wallThickness, 0.4);
  const splitHeight = effectiveSplitHeight(body);
  const thickness = Math.max(spec.thickness, 0.8);
  const clearance = Math.min(Math.max(spec.fitClearance, 0), 1.5);
  const grooveDepth = Math.min(
    Math.max(spec.grooveDepth, 0.2),
    Math.max(wallThickness - MIN_PANEL_SKIN, 0.2),
  );
  const channelBottomZ = wallThickness - grooveDepth;
  // The lid's cavity ceiling: how far the capture pocket can bite up from the seam before it runs
  // out of skirt to cut.
  const ceilingZ = body.outer.height - wallThickness;
  const roomForCapture = ceilingZ - splitHeight - 0.4;
  const lidCaptureDepth = spec.captureInLid ? Math.min(grooveDepth, Math.max(roomForCapture, 0)) : 0;
  const captured = lidCaptureDepth >= 0.4;
  return {
    faces: PANEL_FACE_ORDER.filter((f) => spec.faces.includes(f)),
    thickness,
    clearance,
    grooveDepth,
    lidCaptureDepth: captured ? lidCaptureDepth : 0,
    wallThickness,
    cornerInset: body.cornerStyle.type === 'sharp' ? 0 : Math.max(body.cornerStyle.radius, 0),
    splitHeight,
    channelBottomZ,
    plateBottomZ: channelBottomZ + clearance / 2,
    // With lid capture the plate runs on past the base's rim into a matching groove in the lid's
    // underside; without it the plate stops flush with the rim and the flat lid holds it down.
    plateTopZ: captured ? splitHeight + lidCaptureDepth - clearance / 2 : splitHeight,
  };
}

export function isPanelFace(face: Face, metrics: PanelMetrics | null): face is PanelFace {
  return metrics !== null && (metrics.faces as Face[]).includes(face);
}

/**
 * Which printed part a feature's geometry belongs to -- the routing rule the CSG pipeline uses to
 * pick its boolean target, and the viewport uses to know which mesh a marker rides on. Additive
 * interior features (standoffs, board mounts, support pads) always mount to the base floor.
 * Everything else goes by where the feature physically sits: a panel face claims it only over the
 * plate's own Z span, so a cutout down in the floor slab or up in the lid still lands on the piece
 * that has material there.
 */
export function featurePart(
  feature: Pick<Feature, 'type' | 'face' | 'u' | 'v' | 'mount'>,
  body: EnclosureBody,
): PartId {
  if (feature.type === 'standoff' || feature.type === 'board-mount' || feature.type === 'support-pad') {
    return 'base';
  }
  if (feature.face === 'top') return 'lid';
  if (feature.face === 'bottom') return 'base';

  const splitHeight = effectiveSplitHeight(body);
  const z = faceFrame(feature.face, bodyGeometry(body)).toWorld(feature.u, feature.v)[2];

  const metrics = panelMetrics(body);
  // A corner-anchored mount hangs off the corner post, which is base/lid material -- panels stop
  // short of the corners, so it must never be routed to one even when its face is a panel face.
  const cornerAnchored = feature.type === 'external-mount' && feature.mount?.anchor === 'corner';
  if (metrics && !cornerAnchored && isPanelFace(feature.face, metrics)) {
    if (z >= metrics.plateBottomZ && z <= metrics.plateTopZ) return panelPartId(feature.face);
  }
  return z > splitHeight ? 'lid' : 'base';
}
