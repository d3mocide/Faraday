import { deriveOverhangSupport, type DerivedOverhangSupport } from '../state/boardSupport';
import type { BoardMountSpec, EnclosureBody, Feature } from '../types/project';
import { getFeature2DBounds } from './blueprint2d';
import { bodyGeometry, faceFrame, faceSize, type BodyGeometry } from './faceFrame';
import type { PrintRules } from './printRules';

export interface ResolvedWallTie {
  axis: 'x' | 'y';
  sign: 1 | -1;
  wall: number;
  ribWidth: number;
  height: number;
}

export interface ResolvedBoardPost {
  x: number;
  y: number;
  reinforcement: 'floor-post' | 'wall-rib';
  tie?: ResolvedWallTie;
  /** A nearer wall was deliberately avoided because a through-wall opening occupies the rib's
   * path. This is advisory data for the inspector, never persisted project state. */
  keepoutAvoided?: boolean;
  reason: string;
}

export interface ResolvedBoardMountPlan {
  posts: ResolvedBoardPost[];
  undersideSupport: DerivedOverhangSupport | null;
  reasons: string[];
}

interface WallTieCandidate {
  axis: 'x' | 'y';
  sign: 1 | -1;
  wall: number;
  gap: number;
}

function tieFace(candidate: WallTieCandidate): 'front' | 'back' | 'left' | 'right' {
  if (candidate.axis === 'x') return candidate.sign === 1 ? 'right' : 'left';
  return candidate.sign === 1 ? 'back' : 'front';
}

/** True when a prospective vertical rib would occupy the same wall span as a real opening. It
 * intentionally uses a rotated bounding envelope and a small clearance: declining one optional
 * tie is safer than leaving a tiny material bridge beside a connector that a user expects clear. */
function tieHitsWallOpening(
  candidate: WallTieCandidate,
  x: number,
  y: number,
  ribWidth: number,
  height: number,
  geom: BodyGeometry,
  wallThickness: number,
  features: readonly Feature[],
): boolean {
  const face = tieFace(candidate);
  const [sizeU, sizeV] = faceSize(face, geom);
  const tangent = candidate.axis === 'x' ? y : x;
  const tieBottom = wallThickness;
  const tieTop = tieBottom + height;
  const clearance = 0.5;

  for (const feature of features) {
    if (
      feature.hidden ||
      feature.face !== face ||
      !['connector-cutout', 'custom-hole', 'vent', 'fan-mount'].includes(feature.type)
    ) continue;
    const bounds = getFeature2DBounds(feature, sizeU, sizeV);
    const theta = (feature.rotationDeg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(theta));
    const sin = Math.abs(Math.sin(theta));
    const halfU = (bounds.widthMm * cos + bounds.heightMm * sin) / 2;
    const halfV = (bounds.widthMm * sin + bounds.heightMm * cos) / 2;
    const [worldX, worldY, worldZ] = faceFrame(face, geom).toWorld(feature.u, feature.v);
    const openingTangent = candidate.axis === 'x' ? worldY : worldX;
    const tangentOverlap = Math.abs(openingTangent - tangent) < halfU + ribWidth / 2 + clearance;
    const verticalOverlap = worldZ + halfV + clearance > tieBottom && worldZ - halfV - clearance < tieTop;
    if (tangentOverlap && verticalOverlap) return true;
  }
  return false;
}

function wallTieForPost(
  board: BoardMountSpec,
  x: number,
  y: number,
  geom: BodyGeometry,
  wallThickness: number,
  rules: PrintRules,
  features: readonly Feature[],
): { tie: ResolvedWallTie | null; keepoutAvoided: boolean } {
  if (geom.shape !== 'box') return { tie: null, keepoutAvoided: false };

  const radius = Math.max(board.standoff.outerDiameter, 1) / 2;
  const innerX = Math.max(geom.length / 2 - wallThickness, 0);
  const innerY = Math.max(geom.width / 2 - wallThickness, 0);
  const candidates: WallTieCandidate[] = [
    { axis: 'x' as const, sign: 1 as const, wall: innerX, gap: innerX - x - radius },
    { axis: 'x' as const, sign: -1 as const, wall: -innerX, gap: x - radius + innerX },
    { axis: 'y' as const, sign: 1 as const, wall: innerY, gap: innerY - y - radius },
    { axis: 'y' as const, sign: -1 as const, wall: -innerY, gap: y - radius + innerY },
  ].filter((candidate) => candidate.gap >= 0);

  const maximumGap = Math.max(board.standoff.outerDiameter, rules.minRib * 4);
  const eligible = candidates.filter((candidate) => candidate.gap <= maximumGap).sort((a, b) => a.gap - b.gap);
  const ribWidth = Math.min(Math.max(rules.minRib, 0.8), Math.max(board.standoff.outerDiameter * 0.7, 0.8));
  const height = Math.max(board.standoff.height, 1);
  let keepoutAvoided = false;
  for (const candidate of eligible) {
    if (tieHitsWallOpening(candidate, x, y, ribWidth, height, geom, wallThickness, features)) {
      keepoutAvoided = true;
      continue;
    }
    return { tie: { ...candidate, ribWidth, height }, keepoutAvoided };
  }
  return { tie: null, keepoutAvoided };
}

/** Resolves structural mounting intent into deterministic placements. It has no Manifold ownership
 * and no persisted output: the plan is recomputed from the board, shell, and active profile for
 * every generation so its reasons remain trustworthy. */
export function resolveBoardMountPlan(
  feature: Pick<Feature, 'u' | 'v' | 'rotationDeg' | 'board'>,
  body: EnclosureBody,
  rules: PrintRules,
  features: readonly Feature[] = [],
): ResolvedBoardMountPlan {
  const board = feature.board;
  if (!board) throw new Error('board-mount feature is missing its board spec');

  const geom = bodyGeometry(body);
  const [cx, cy] = faceFrame('bottom', geom).toWorld(feature.u, feature.v);
  const theta = (feature.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const auto = board.mountStrategy === 'auto';
  const posts = board.holes.map((hole) => {
    const x = cx + hole.x * cos - hole.y * sin;
    const y = cy + hole.x * sin + hole.y * cos;
    const tieResult = auto
      ? wallTieForPost(board, x, y, geom, Math.max(body.wallThickness, 0.4), rules, features)
      : { tie: null, keepoutAvoided: false };
    const tie = tieResult?.tie ?? null;
    return {
      x,
      y,
      reinforcement: tie ? ('wall-rib' as const) : ('floor-post' as const),
      ...(tie ? { tie } : {}),
      ...(tieResult?.keepoutAvoided ? { keepoutAvoided: true } : {}),
      reason: tie
        ? tieResult?.keepoutAvoided
          ? 'A nearer wall opening is kept clear; the rib uses the next eligible wall path.'
          : 'Near a box wall, so a profile-thickness rib reinforces the post without filling the cavity.'
        : tieResult?.keepoutAvoided
          ? 'Floor post retained because every nearby wall path overlaps a through-wall opening.'
          : 'Floor post retained; there is no eligible nearby wall tie.',
    };
  });

  // Preserve the long-standing empty-hole fallback unless corner guides provide the board's only
  // retention. It is intentionally not wall-tied: no hardware datum tells the resolver where to
  // anchor a synthetic center post.
  if (posts.length === 0 && !board.cornerGuides) {
    posts.push({
      x: cx,
      y: cy,
      reinforcement: 'floor-post',
      reason: 'Fallback center post for a board mount with no documented hole pattern.',
    });
  }

  const undersideSupport = auto ? deriveOverhangSupport(board, feature, body) : null;
  const reasons = [
    `${posts.filter((post) => post.reinforcement === 'wall-rib').length} of ${posts.length} post${posts.length === 1 ? '' : 's'} use a wall rib.`,
    posts.some((post) => post.keepoutAvoided)
      ? 'A wall-opening keep-out redirected or omitted a nearby rib.'
      : 'No wall-opening keep-out changed the reinforcement path.',
    undersideSupport
      ? `${undersideSupport.edge} edge gets a ${undersideSupport.pad.count ?? 1}-pad underside support row (${undersideSupport.unsupportedMm.toFixed(1)}mm unsupported).`
      : 'No board-edge support row is needed from the available mounting-hole pattern.',
  ];
  return { posts, undersideSupport, reasons };
}
