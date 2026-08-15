import type {
  EnclosureBody,
  Face,
  Feature,
  PanelFace,
  PanelScrewSpec,
  ScrewInsertType,
  ScrewSize,
} from '../types/project';
import { bodyGeometry, faceFrame } from './faceFrame';
import { effectiveSplitHeight } from './lidSplit';
import { cornerSurfaceInset, MIN_SKIN } from './printRules';
import { SCREW_HOLE_SPECS } from './screwLibrary';

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
/** Everything the CSG needs to put screws through a plate's ends, already clamped. */
export interface PanelScrewMetrics {
  size: ScrewSize;
  insertType: ScrewInsertType;
  /** Post footprint: along the face, and inward from the plate's own inner surface. */
  postWidth: number;
  postDepth: number;
  /** Through-hole in the plate. */
  clearanceDiameter: number;
  /** Counterbore for the head, so it doesn't stand proud of the case. 0 = head left proud. */
  headDiameter: number;
  counterboreDepth: number;
  /** Bore in the post: a pilot for a self-tapping screw, or the socket for a heat-set insert. */
  boreDiameter: number;
  boreDepth: number;
  /** How far in from the cavity edge the post (and the screw through it) is centred. */
  centerInset: number;
  /** World Z of each screw at one end of the plate. */
  zPositions: number[];
}

export interface PanelMetrics {
  faces: PanelFace[];
  /** Plate thickness (through-wall). */
  thickness: number;
  /** Total slop between plate and channel; half of it lands on each side. */
  clearance: number;
  grooveDepth: number;
  /** Wall material left standing proud of the plate at each end, overlapping its rebated ends so
   * it can't be pulled out sideways -- see PanelSpec.retainLip. 0 means no retention. */
  retainLip: number;
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
  /** Null when the plate isn't screwed down. */
  screw: PanelScrewMetrics | null;
  /**
   * How much material the body's corner treatment actually leaves for a retaining lip at the
   * tightest point of the plate's end grip. The channel is clipped so it never produces a lip
   * thinner than nominal (see PanelShells), which means a corner too big for the wall doesn't give
   * a fragile lip -- it gives *no* lip over that stretch. This is the number that says so, and
   * runDesignChecks reports it rather than letting the case look retained when it isn't.
   */
  cornerLipRoom: number;
}

/** Three perimeters at a 0.4mm nozzle. The lip is the only thing holding an unscrewed plate in, so
 * it gets the structural floor rather than the absolute minimum a slicer can extrude. */
const DEFAULT_RETAIN_LIP = MIN_SKIN;

function panelScrewMetrics(
  spec: PanelScrewSpec | undefined,
  thickness: number,
  plateBottomZ: number,
  plateTopZ: number,
): PanelScrewMetrics | null {
  if (!spec) return null;
  const hole = SCREW_HOLE_SPECS[spec.size];
  const heatSet = spec.insertType === 'heat-set';
  const boreDiameter = heatSet ? hole.heatSetHoleDiameter : hole.selfTapPilotDiameter;
  // A heat-set insert pushes a slug of molten plastic ahead of it, so the socket is bored deeper
  // than the insert is long; a self-tapping screw wants a couple of diameters of thread to bite.
  const boreDepth = heatSet ? hole.heatSetDepth + 1.5 : Math.max(boreDiameter * 3, 4);
  const postDepth = Math.max(spec.postDepth, boreDepth + MIN_SKIN);
  // Wide enough that the bore, and the head sunk into the plate above it, both keep their skin.
  const postWidth = Math.max(spec.postWidth, boreDiameter + 2 * MIN_SKIN, hole.headDiameter + 2 * MIN_SKIN);
  const counterboreDepth =
    spec.headStyle === 'counterbore' ? Math.max(Math.min(thickness - MIN_SKIN, 1.6), 0) : 0;

  // Keep the head's counterbore clear of the plate's top and bottom edges.
  const edgeInset = Math.max(hole.headDiameter / 2 + MIN_SKIN, 4);
  const span = plateTopZ - plateBottomZ;
  const mid = (plateBottomZ + plateTopZ) / 2;
  const zPositions =
    spec.countPerEnd === 2 && span > 4 * edgeInset
      ? [plateBottomZ + edgeInset, plateTopZ - edgeInset]
      : [mid];

  return {
    size: spec.size,
    insertType: spec.insertType,
    postWidth,
    postDepth,
    clearanceDiameter: hole.clearanceDiameter,
    headDiameter: hole.headDiameter,
    counterboreDepth,
    boreDiameter,
    boreDepth,
    centerInset: postWidth / 2,
    zPositions,
  };
}

export function panelMetrics(body: EnclosureBody): PanelMetrics | null {
  if (body.shape !== 'box' || !body.panels || body.panels.faces.length === 0) return null;
  const spec = body.panels;
  const wallThickness = Math.max(body.wallThickness, 0.4);
  const splitHeight = effectiveSplitHeight(body);
  const thickness = Math.max(spec.thickness, MIN_SKIN);
  const clearance = Math.min(Math.max(spec.fitClearance, 0), 1.5);
  const grooveDepth = Math.min(
    Math.max(spec.grooveDepth, 0.2),
    Math.max(wallThickness - MIN_SKIN, 0.2),
  );
  // The lip eats into the plate's thickness (the ends are rebated to slide behind it), so it can
  // never take so much that the rebated end stops being printable. The lip is also what the
  // channel's end slots are held clear of the outer surface by -- see panelChannelCut, which
  // intersects them with a shell shrunk by exactly this much so the lip keeps its full thickness
  // around a rounded or chamfered corner instead of tapering into the arc.
  // The fit clearance comes out of the same budget: the plate's rebated ear has to clear the lip
  // by clearance/2 and still keep its own skin, so a plate needs 2*MIN_SKIN + clearance/2 of
  // thickness before both halves of the joint are at full strength. Below that the two share what
  // there is, and runDesignChecks speaks up once either drops under MIN_WALL.
  const lipBudget = Math.max(thickness - clearance / 2, 0);
  const retainLip = Math.min(
    Math.max(spec.retainLip ?? DEFAULT_RETAIN_LIP, 0),
    // Give the ear its full skin where the plate can afford it, and split the budget evenly where
    // it can't -- starving one half of a joint to keep the other at target helps nobody.
    Math.max(lipBudget - MIN_SKIN, lipBudget / 2),
  );
  const channelBottomZ = wallThickness - grooveDepth;
  // The lid's cavity ceiling: how far the capture pocket can bite up from the seam before it runs
  // out of skirt to cut.
  const ceilingZ = body.outer.height - wallThickness;
  const roomForCapture = ceilingZ - splitHeight - 0.4;
  const lidCaptureDepth = spec.captureInLid ? Math.min(grooveDepth, Math.max(roomForCapture, 0)) : 0;
  const captured = lidCaptureDepth >= 0.4;
  const plateBottomZ = channelBottomZ + clearance / 2;
  const plateTopZ = captured ? splitHeight + lidCaptureDepth - clearance / 2 : splitHeight;
  return {
    faces: PANEL_FACE_ORDER.filter((f) => spec.faces.includes(f)),
    thickness,
    clearance,
    grooveDepth,
    retainLip,
    lidCaptureDepth: captured ? lidCaptureDepth : 0,
    wallThickness,
    cornerInset: body.cornerStyle.type === 'sharp' ? 0 : Math.max(body.cornerStyle.radius, 0),
    splitHeight,
    channelBottomZ,
    plateBottomZ,
    // With lid capture the plate runs on past the base's rim into a matching groove in the lid's
    // underside; without it the plate stops flush with the rim and the flat lid holds it down.
    plateTopZ,
    screw: panelScrewMetrics(spec.screw, thickness, plateBottomZ, plateTopZ),
    // Measured at the outermost point of the grip -- the far edge of the groove, which is the part
    // of the wall closest to the corner and therefore the first to run out of material.
    cornerLipRoom: Math.max(
      thickness +
        clearance -
        cornerSurfaceInset(body.cornerStyle, Math.max(wallThickness - grooveDepth, 0)),
      0,
    ),
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
