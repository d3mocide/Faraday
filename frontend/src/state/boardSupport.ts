import { bodyGeometry, faceFrame } from '../csg/faceFrame';
import type { BoardMountSpec, EnclosureBody, Feature } from '../types/project';

/**
 * Works out where a board needs propping up and returns a ready-to-place support-pad row.
 *
 * The heuristic is the one a person applies by eye: look at each of the board's four edges, see how
 * far it is from the nearest mounting hole, and take the worst one. A board bolted down through
 * holes along one side leaves the opposite side cantilevered over open air, which is exactly where
 * plugging in a cable flexes the PCB. Returns null when no edge is far enough from its nearest hole
 * to be worth propping -- a board with holes at all four corners doesn't need this.
 */
export interface OverhangSupport {
  /** Which board edge is being propped, for the UI to name. */
  edge: 'left' | 'right' | 'front' | 'back';
  /** Distance from that edge to its nearest mounting hole, mm -- how bad the overhang is. */
  unsupportedMm: number;
  feature: Feature;
}

/** Below this, an edge is close enough to a hole that a pad wouldn't earn its filament. */
const MIN_OVERHANG_MM = 15;
/** How far the pads sit in from the board's outline, so they bear on the PCB and not on air. */
const EDGE_INSET_MM = 1;
/** Corners are held by the board's own stiffness, so the row stops short of them. */
const CORNER_MARGIN_MM = 8;

export function planOverhangSupport(
  board: BoardMountSpec,
  boardFeature: Pick<Feature, 'u' | 'v' | 'rotationDeg'>,
  body: EnclosureBody,
): OverhangSupport | null {
  if (board.holes.length === 0) return null;

  const halfW = board.boardWidth / 2;
  const halfD = board.boardDepth / 2;
  // Distance from each edge to the closest hole, in board-local mm.
  const candidates = [
    { edge: 'right' as const, gap: Math.min(...board.holes.map((h) => halfW - h.x)), axis: 'x' as const, sign: 1 },
    { edge: 'left' as const, gap: Math.min(...board.holes.map((h) => halfW + h.x)), axis: 'x' as const, sign: -1 },
    { edge: 'back' as const, gap: Math.min(...board.holes.map((h) => halfD - h.y)), axis: 'y' as const, sign: 1 },
    { edge: 'front' as const, gap: Math.min(...board.holes.map((h) => halfD + h.y)), axis: 'y' as const, sign: -1 },
  ];
  const worst = candidates.reduce((a, b) => (b.gap > a.gap ? b : a));
  if (worst.gap < MIN_OVERHANG_MM) return null;

  const padWidth = 6;
  const padDepth = 5;
  // Across the edge: just inside the board outline. Along it: centred, stopping clear of the
  // corners, with enough pads that the span between them stays under ~40mm.
  const spanHalf = (worst.axis === 'x' ? halfD : halfW) - CORNER_MARGIN_MM;
  const span = Math.max(spanHalf * 2, 0);
  const count = Math.min(Math.max(Math.round(span / 40) + 1, 2), 6);
  const pitch = count > 1 ? span / (count - 1) : 0;
  const offset = (worst.axis === 'x' ? halfW : halfD) - padWidth / 2 - EDGE_INSET_MM;

  // Board-local offsets -> world, through the board's own rotation.
  const theta = (boardFeature.rotationDeg * Math.PI) / 180;
  const localX = worst.axis === 'x' ? worst.sign * offset : 0;
  const localY = worst.axis === 'y' ? worst.sign * offset : 0;
  const geom = bodyGeometry(body);
  const [boardX, boardY] = faceFrame('bottom', geom).toWorld(boardFeature.u, boardFeature.v);
  const worldX = boardX + localX * Math.cos(theta) - localY * Math.sin(theta);
  const worldY = boardY + localX * Math.sin(theta) + localY * Math.cos(theta);

  const [faceWidth, faceDepth] = [
    geom.shape === 'box' ? geom.length : geom.diameter,
    geom.shape === 'box' ? geom.width : geom.diameter,
  ];

  return {
    edge: worst.edge,
    unsupportedMm: worst.gap,
    feature: {
      id: crypto.randomUUID(),
      type: 'support-pad',
      face: 'bottom',
      u: worldX / faceWidth + 0.5,
      v: worldY / faceDepth + 0.5,
      // The pad's own width runs across the edge it props, so a row along the board's Y edge is
      // turned 90 degrees relative to one along its X edge.
      rotationDeg: boardFeature.rotationDeg + (worst.axis === 'y' ? 90 : 0),
      pad: {
        shape: 'rect',
        width: padWidth,
        depth: padDepth,
        height: board.standoff.height,
        count,
        pitch,
        axis: 'v',
      },
    },
  };
}
