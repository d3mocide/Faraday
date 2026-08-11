import { bodyGeometry, faceFrame, supportPadPositions } from '../csg/faceFrame';
import type { BoardMountSpec, EnclosureProject, Feature } from '../types/project';

/**
 * One thing worth telling the user about their design. Advisory only -- nothing here blocks an
 * export, because every rule is a heuristic about intent and the user always knows more than we do
 * about their hardware.
 */
export interface DesignCheckFinding {
  /** Stable within one run, for React keys. */
  id: string;
  /** The feature the finding is about, so the UI can select it and the viewport can flag it. */
  featureId: string;
  title: string;
  detail: string;
}

/** A placed board's footprint in world mm, with the rotation it was placed at. */
interface BoardFootprint {
  centerX: number;
  centerY: number;
  halfWidth: number;
  halfDepth: number;
  rotationDeg: number;
  spec: BoardMountSpec;
}

function boardFootprints(project: EnclosureProject): BoardFootprint[] {
  const geom = bodyGeometry(project.body);
  const prints: BoardFootprint[] = [];
  for (const feature of project.features) {
    if (feature.type !== 'board-mount' || !feature.board || feature.hidden) continue;
    const [x, y] = faceFrame('bottom', geom).toWorld(feature.u, feature.v);
    prints.push({
      centerX: x,
      centerY: y,
      halfWidth: feature.board.boardWidth / 2,
      halfDepth: feature.board.boardDepth / 2,
      rotationDeg: feature.rotationDeg,
      spec: feature.board,
    });
  }
  return prints;
}

/** Rotates a world point into a board's own frame, so a rotated board is still a plain rectangle. */
function toBoardLocal(board: BoardFootprint, x: number, y: number): [number, number] {
  const theta = (-board.rotationDeg * Math.PI) / 180;
  const dx = x - board.centerX;
  const dy = y - board.centerY;
  return [dx * Math.cos(theta) - dy * Math.sin(theta), dx * Math.sin(theta) + dy * Math.cos(theta)];
}

function isUnderBoard(board: BoardFootprint, x: number, y: number): boolean {
  const [lx, ly] = toBoardLocal(board, x, y);
  return Math.abs(lx) <= board.halfWidth && Math.abs(ly) <= board.halfDepth;
}

/** World (x, y) of every standoff a board-mount generates. */
function boardStandoffPositions(board: BoardFootprint): Array<[number, number]> {
  const theta = (board.rotationDeg * Math.PI) / 180;
  return board.spec.holes.map(({ x, y }) => [
    board.centerX + x * Math.cos(theta) - y * Math.sin(theta),
    board.centerY + x * Math.sin(theta) + y * Math.cos(theta),
  ]);
}

/** Half-extent of a pad's footprint, as a radius -- close enough for an overlap heuristic. */
function padRadius(feature: Feature): number {
  const pad = feature.pad!;
  return pad.shape === 'round'
    ? Math.max(pad.width, 1) / 2
    : Math.hypot(Math.max(pad.width, 1), Math.max(pad.depth, 1)) / 2;
}

/**
 * Advisory design checks over the whole project. Deliberately quiet: a rule only fires when the
 * project contains enough information to be sure it's wrong. A support pad in a project with no
 * board at all, for instance, is not flagged -- there's nothing to check it against, and the user
 * may well be propping something we know nothing about.
 */
export function runDesignChecks(project: EnclosureProject): DesignCheckFinding[] {
  const findings: DesignCheckFinding[] = [];
  const geom = bodyGeometry(project.body);
  const boards = boardFootprints(project);
  if (boards.length === 0) return findings;

  const standoffs: Array<[number, number, number]> = []; // x, y, radius
  for (const board of boards) {
    const radius = board.spec.standoff.outerDiameter / 2;
    for (const [x, y] of boardStandoffPositions(board)) standoffs.push([x, y, radius]);
  }
  for (const feature of project.features) {
    if (feature.type === 'standoff' && feature.standoff && !feature.hidden) {
      const [x, y] = faceFrame('bottom', geom).toWorld(feature.u, feature.v);
      standoffs.push([x, y, feature.standoff.outerDiameter / 2]);
    }
  }

  for (const feature of project.features) {
    if (feature.type !== 'support-pad' || !feature.pad || feature.hidden) continue;
    const positions = supportPadPositions(feature, geom);
    const radius = padRadius(feature);

    const stranded = positions.filter((p) => !boards.some((b) => isUnderBoard(b, p[0], p[1])));
    if (stranded.length > 0) {
      findings.push({
        id: `${feature.id}:not-under-board`,
        featureId: feature.id,
        title:
          stranded.length === positions.length
            ? 'Support pad is not under a board'
            : `${stranded.length} of ${positions.length} pads in this row are not under a board`,
        detail: 'It will print, but nothing will rest on it. Move it inside a board outline.',
      });
    }

    // Height only makes sense to compare against the board it's actually under.
    const host = boards.find((b) => positions.some((p) => isUnderBoard(b, p[0], p[1])));
    if (host) {
      const target = host.spec.standoff.height;
      const delta = feature.pad.height - target;
      if (Math.abs(delta) > 0.05) {
        findings.push({
          id: `${feature.id}:height`,
          featureId: feature.id,
          title:
            delta > 0
              ? `Support pad is ${delta.toFixed(1)}mm taller than the board's standoffs`
              : `Support pad is ${Math.abs(delta).toFixed(1)}mm short of the board`,
          detail:
            delta > 0
              ? `It will lift the board off its standoffs. The board sits ${target}mm up.`
              : `It will not touch the board, so it can't support anything. The board sits ${target}mm up.`,
        });
      }
    }

    const clash = positions.find((p) =>
      standoffs.some(([sx, sy, sr]) => Math.hypot(p[0] - sx, p[1] - sy) < sr + radius - 0.2),
    );
    if (clash) {
      findings.push({
        id: `${feature.id}:hits-standoff`,
        featureId: feature.id,
        title: 'Support pad overlaps a standoff',
        detail:
          'The two merge into one blob and the board can rock on it. Move the pad clear of the mounting holes.',
      });
    }
  }

  return findings;
}
