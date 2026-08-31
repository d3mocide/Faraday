import { getFeature2DBounds } from '../csg/blueprint2d';
import { bodyGeometry, faceFrame, faceSize, supportPadPositions } from '../csg/faceFrame';
import { featurePart, panelMetrics, partLabel, type PartId } from '../csg/parts';
import { effectiveSplitHeight } from '../csg/lidSplit';
import { printRulesForProfile, type PrintRules } from '../csg/printRules';
import { manufacturingProfileForProject } from './manufacturingProfiles';
import { resolveLidSeamReveal, resolveRefinedLidField } from '../csg/lidTreatment';
import type {
  BoardMountSpec,
  EnclosureProject,
  Face,
  Feature,
  FeatureType,
} from '../types/project';

/**
 * One thing worth telling the user about their design. Advisory only -- nothing here blocks an
 * export, because every rule is a heuristic about intent and the user always knows more than we do
 * about their hardware.
 */
export interface DesignCheckFinding {
  /** Stable within one run, for React keys. */
  id: string;
  /** The feature the finding is about, so the UI can select it and the viewport can flag it.
   * Absent for findings about the body itself. */
  featureId?: string;
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

/** Feature types that remove material right through a wall, so the gap between two of them (or
 * between one and the edge of its printed piece) is all the material there is. Grip ribs are cut
 * only part-way into the wall and standoffs add material rather than removing it, so neither
 * belongs here. */
const CUTOUT_TYPES: FeatureType[] = ['connector-cutout', 'custom-hole', 'vent', 'fan-mount'];

/** A cutout's extent on its own face, in mm, as an axis-aligned box around its centre. */
interface CutoutBox {
  feature: Feature;
  part: PartId;
  face: Face;
  /** mm from the face's centre, along the face's u axis. */
  minU: number;
  maxU: number;
  /** mm from the face's centre, along the face's v axis. */
  minV: number;
  maxV: number;
}

function cutoutBoxes(project: EnclosureProject, rules: PrintRules): CutoutBox[] {
  const geom = bodyGeometry(project.body);
  const boxes: CutoutBox[] = [];
  for (const feature of project.features) {
    if (feature.hidden || !CUTOUT_TYPES.includes(feature.type)) continue;
    const [sizeU, sizeV] = faceSize(feature.face, geom);
    const bounds = getFeature2DBounds(feature, sizeU, sizeV);
    // Rotated openings are measured by their axis-aligned envelope: it never under-reports a gap,
    // which is the direction an advisory check should err in.
    const theta = (feature.rotationDeg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(theta));
    const sin = Math.abs(Math.sin(theta));
    const halfU = (bounds.widthMm * cos + bounds.heightMm * sin) / 2;
    const halfV = (bounds.widthMm * sin + bounds.heightMm * cos) / 2;
    boxes.push({
      feature,
      part: featurePart(feature, project.body, rules),
      face: feature.face,
      minU: bounds.centerMmU - halfU,
      maxU: bounds.centerMmU + halfU,
      minV: bounds.centerMmV - halfV,
      maxV: bounds.centerMmV + halfV,
    });
  }
  return boxes;
}

/** The span of a face that the printed piece actually has material across, in the same face-centred
 * mm as CutoutBox. Null where the piece's outline isn't a simple rectangle to measure against. */
function usableFaceExtent(
  face: Face,
  part: PartId,
  project: EnclosureProject,
  rules: PrintRules,
): { minU: number; maxU: number; minV: number; maxV: number } | null {
  const body = project.body;
  const geom = bodyGeometry(body);
  const [sizeU, sizeV] = faceSize(face, geom);
  const corner =
    body.shape === 'box' || body.shape === 'wedge' || body.shape === 'stadium'
      ? body.cornerStyle.type === 'sharp'
        ? 0
        : Math.max(body.cornerStyle.radius, 0)
      : 0;

  const metrics = panelMetrics(body, rules);
  if (part.startsWith('panel-') && metrics) {
    // A plate's opening stops at the wall it slides behind, and at the top and bottom of the plate.
    const halfU = sizeU / 2 - metrics.wallThickness;
    const height = body.shape === 'wedge' ? body.outer.heightBack : body.outer.height;
    return {
      minU: -halfU,
      maxU: halfU,
      minV: metrics.plateBottomZ - height / 2,
      maxV: metrics.plateTopZ - height / 2,
    };
  }

  if (face === 'top' || face === 'bottom') {
    if (geom.shape !== 'box' && geom.shape !== 'stadium' && geom.shape !== 'wedge') return null;
    return {
      minU: -(sizeU / 2 - corner),
      maxU: sizeU / 2 - corner,
      minV: -(sizeV / 2 - corner),
      maxV: sizeV / 2 - corner,
    };
  }

  if (geom.shape !== 'box') return null;
  // A lateral wall of the base runs from the floor up to the lid seam; the lid's own wall carries
  // on above it. Sideways there is no edge to measure against at all -- the wall turns the corner
  // and carries on as the next wall, so material is continuous however close a cutout gets to it.
  const height = geom.height;
  const split = Math.min(Math.max(body.lid.splitHeight, 0), height);
  const zRange: [number, number] = part === 'lid' ? [split, height] : [0, split];
  return {
    minU: -Infinity,
    maxU: Infinity,
    minV: zRange[0] - height / 2,
    maxV: zRange[1] - height / 2,
  };
}

/** Clearance between two axis-aligned boxes: the larger per-axis separation, which is negative on
 * both axes only when the two have merged into one opening. */
function gapBetween(a: CutoutBox, b: CutoutBox): number {
  return Math.max(
    Math.max(b.minU - a.maxU, a.minU - b.maxU),
    Math.max(b.minV - a.maxV, a.minV - b.maxV),
  );
}

function sharesMergedOpening(a: CutoutBox, b: CutoutBox, boxes: readonly CutoutBox[]): boolean {
  const group = a.feature.mergedOpeningGroup;
  if (!group || group !== b.feature.mergedOpeningGroup) return false;

  const visited = new Set<string>([a.feature.id]);
  const pending = [a];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.feature.id === b.feature.id) return true;
    for (const candidate of boxes) {
      if (
        candidate.feature.mergedOpeningGroup !== group ||
        visited.has(candidate.feature.id) ||
        candidate.face !== current.face ||
        candidate.part !== current.part ||
        gapBetween(current, candidate) > 0
      ) {
        continue;
      }
      visited.add(candidate.feature.id);
      pending.push(candidate);
    }
  }
  return false;
}

function describeFeature(feature: Feature): string {
  if (feature.type === 'connector-cutout' && feature.connectorId) return feature.connectorId;
  if (feature.type === 'vent') return 'vent';
  if (feature.type === 'fan-mount') return 'fan opening';
  return 'cutout';
}

/**
 * Openings that leave less than a printable amount of material between them, or between themselves
 * and the edge of the piece they are cut into.
 *
 * These only ever warn. Where a groove or a slot end is a dimension the generator chose, it gets
 * clamped silently -- but a port's position is functional, and quietly sliding an Ethernet jack to
 * buy a millimetre of web would produce a case that no longer fits the board it was measured for.
 */
function seamFindings(project: EnclosureProject, rules: PrintRules): DesignCheckFinding[] {
  const findings: DesignCheckFinding[] = [];
  const bodyHeight = project.body.shape === 'wedge' ? project.body.outer.heightBack : project.body.outer.height;
  const splitV = effectiveSplitHeight(project.body) - bodyHeight / 2;

  for (const box of cutoutBoxes(project, rules)) {
    if (box.face === 'top' || box.face === 'bottom') continue;
    // A slide-in panel is a separate printed piece that may deliberately run through the base/lid
    // interface, so only openings routed to the base or lid itself need this seam check.
    if (box.part !== 'base' && box.part !== 'lid') continue;

    const seamGap = box.part === 'base' ? splitV - box.maxV : box.minV - splitV;
    if (seamGap >= rules.minSkin - 1e-6) continue;

    findings.push({
      id: `${box.feature.id}:lid-seam`,
      featureId: box.feature.id,
      title:
        seamGap <= 0
          ? `${describeFeature(box.feature)} crosses the lid seam`
          : `Only ${seamGap.toFixed(2)}mm between ${describeFeature(box.feature)} and the lid seam`,
      detail:
        seamGap <= 0
          ? 'The opening would split across two printed parts. Move the opening, or change the lid split height.'
          : `Keep at least ${rules.minSkin.toFixed(2)}mm of material at the seam for this print profile. Move the opening, or change the lid split height.`,
    });
  }

  return findings;
}

function marginFindings(project: EnclosureProject, rules: PrintRules): DesignCheckFinding[] {
  const findings: DesignCheckFinding[] = [];
  const boxes = cutoutBoxes(project, rules);

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.face !== b.face || a.part !== b.part) continue;
      if (sharesMergedOpening(a, b, boxes)) continue;
      const gap = gapBetween(a, b);
      // Epsilon: these spans are built from board-relative offsets, so an exactly-on-target gap
      // can land a few ULPs under the threshold.
      if (gap >= rules.minWeb - 1e-6) continue;
      findings.push({
        id: `${a.feature.id}:web:${b.feature.id}`,
        featureId: a.feature.id,
        title:
          gap <= 0
            ? `${describeFeature(a.feature)} and ${describeFeature(b.feature)} overlap`
            : `Only ${gap.toFixed(2)}mm of material between two openings`,
        detail:
          gap <= 0
            ? 'They merge into one opening. Move one of them, or make it a single cutout on purpose.'
            : `${rules.lineWidth.toFixed(2)}mm line width needs ${rules.minWeb.toFixed(2)}mm to print a web that holds. Move one opening, or narrow it.`,
      });
    }
  }

  for (const box of boxes) {
    const extent = usableFaceExtent(box.face, box.part, project, rules);
    if (!extent) continue;
    const margin = Math.min(
      box.minU - extent.minU,
      extent.maxU - box.maxU,
      box.minV - extent.minV,
      extent.maxV - box.maxV,
    );
    if (margin >= rules.minSkin - 1e-6) continue;
    findings.push({
      id: `${box.feature.id}:edge-margin`,
      featureId: box.feature.id,
      title:
        margin <= 0
          ? `${describeFeature(box.feature)} runs off the edge of the ${partLabel(box.part).toLowerCase()}`
          : `Only ${margin.toFixed(2)}mm between this opening and the edge of the ${partLabel(box.part).toLowerCase()}`,
      detail:
        margin <= 0
          ? 'Part of the opening has no material around it at all. Move it inboard.'
          : `Openings want ${rules.minSkin.toFixed(2)}mm of material to the edge of their piece, or the edge breaks off in handling.`,
    });
  }

  return findings;
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
  const profile = manufacturingProfileForProject(project);
  const rules = printRulesForProfile(profile);

  if (project.body.wallThickness < rules.minSkin - 1e-6) {
    findings.push({
      id: 'body:wall-thickness',
      title: `Body walls are thinner than the ${rules.minSkin.toFixed(2)}mm profile target`,
      detail:
        `${project.body.wallThickness.toFixed(2)}mm is below ${profile.targetPerimeters}` +
        ` target perimeters at ${rules.lineWidth.toFixed(2)}mm line width. Increase the wall, choose a lighter profile, or calibrate this printer/material combination.`,
    });
  }

  if (project.body.lid.surfaceTreatment === 'refined' && !resolveRefinedLidField(project.body, rules)) {
    findings.push({
      id: 'lid:refined-field-unavailable',
      title: 'The refined lid field does not fit this enclosure',
      detail:
        'It needs a box lid with enough top skin and clear room around the fastener heads. Increase the footprint or wall thickness, use a lighter profile, or return to the plain treatment.',
    });
  }

  if (
    project.body.lid.surfaceTreatment === 'field-marked' &&
    !resolveLidSeamReveal(project.body, rules)
  ) {
    findings.push({
      id: 'lid:seam-reveal-unavailable',
      title: 'The lid seam accent needs more side-wall budget',
      detail:
        'The protected recessed label field can still print, but this profile leaves too little material for the shallow perimeter reveal. Increase the wall thickness, choose a lighter profile, or use the refined field style.',
    });
  }

  for (const feature of project.features) {
    if (feature.type !== 'board-mount' || feature.hidden || feature.board?.mountStrategy !== 'auto') continue;
    if (geom.shape !== 'box') {
      findings.push({
        id: `${feature.id}:auto-ties-box-only`,
        featureId: feature.id,
        title: 'Automatic board-post wall ties currently need a box body',
        detail:
          'The post itself still prints, but no wall tie is added on this footprint. Use Posts only, or switch to a box while the curved/polygonal resolver is added.',
      });
    }
  }

  // A lip the user asked for but can't have: the plate is too thin to rebate, so the panel ends up
  // with nothing holding it in. Choosing 0 deliberately is not flagged -- that's an opt-out, not a
  // mistake.
  const panels = panelMetrics(project.body, rules);
  const requestedLip =
    project.body.shape === 'box' ? project.body.panels?.retainLip : undefined;
  const wantsLip = panels !== null && requestedLip !== 0;
  if (wantsLip && panels.retainLip < rules.minWall) {
    const needed = (2 * rules.minSkin + panels.clearance / 2).toFixed(1);
    findings.push({
      id: 'panels:no-lip',
      title: 'Slide-in plates are too thin to be retained',
      detail:
        `A plate needs ${needed}mm of thickness to give a ${rules.minSkin.toFixed(2)}mm retaining lip and still ` +
        'leave its own rebated end printable. At this thickness the lip is thinner than two ' +
        'perimeters and will snap off the first time the panel is pulled.' +
        (panels.screw ? ' The panel screws are still holding it.' : ''),
    });
  }
  // The corner treatment, not the plate, being what leaves no room. The channel is clipped so it
  // never produces a part-thickness lip, which means this configuration has no grip at all rather
  // than a fragile one -- worth saying out loud, since the case still looks right on screen.
  if (wantsLip && panels.retainLip > 0 && panels.cornerLipRoom < panels.retainLip) {
    findings.push({
      id: 'panels:corner-eats-lip',
      title: "The body's corner style leaves no room to grip the plates",
      detail:
        'By the time the wall reaches the plate, the corner has already cut past the channel, so ' +
        'there is no material to hold the plate in. Reduce the corner radius, thicken the wall, ' +
        'or switch the panels to screws.',
    });
  }
  findings.push(...seamFindings(project, rules));
  findings.push(...marginFindings(project, rules));

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
