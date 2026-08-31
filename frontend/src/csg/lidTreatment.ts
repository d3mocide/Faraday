import { fastenerRecipeForScrew } from '../fasteners/library';
import type { BoxBody, EnclosureBody } from '../types/project';
import { bossPositions, bossRadiusFor } from './primitives';
import type { PrintRules } from './printRules';

export interface ResolvedLidField {
  length: number;
  width: number;
  depth: number;
  cornerRadius: number;
}

/** A deliberately subtle exterior reveal just above the functional lid split. It only removes
 * material that the active profile does not need for its target side-wall skin. */
export interface ResolvedLidSeamReveal {
  depth: number;
  height: number;
  bottomZ: number;
}

/** Derives the one visible treatment currently offered by Faraday. The recessed field is held
 * inside a profile-safe top skin and outside the actual interior screw-head keep-outs rather than
 * merely subtracting a decorative rectangle that could clip a counterbore. */
export function resolveRefinedLidField(
  body: EnclosureBody,
  rules: PrintRules,
): ResolvedLidField | null {
  if (
    body.shape !== 'box' ||
    (body.lid.surfaceTreatment !== 'refined' && body.lid.surfaceTreatment !== 'field-marked')
  ) return null;
  return resolvedFieldForBox(body, rules);
}

/** The field-marked style's seam reveal is intentionally independent of the top field: a small
 * lid can keep its useful label field even if it does not have enough wall budget for the accent. */
export function resolveLidSeamReveal(
  body: EnclosureBody,
  rules: PrintRules,
): ResolvedLidSeamReveal | null {
  if (body.shape !== 'box' || body.lid.surfaceTreatment !== 'field-marked') return null;
  const lidHeight = body.outer.height - body.lid.splitHeight;
  const availableDepth = Math.max(body.wallThickness - rules.minSkin, 0);
  const depth = Math.min(0.3, availableDepth);
  const height = Math.min(0.7, Math.max(lidHeight - 0.5, 0));
  if (lidHeight < 1.2 || depth < 0.15 - 1e-6 || height < 0.35) return null;
  return { depth, height, bottomZ: body.lid.splitHeight + 0.25 };
}

function resolvedFieldForBox(body: BoxBody, rules: PrintRules): ResolvedLidField | null {
  const { length, width } = body.outer;
  const { screw } = body.lid;
  let inset = Math.max(12, rules.minSkin * 2, body.wallThickness + rules.minSkin);

  if (screw && screw.placement !== 'exterior') {
    const recipe = fastenerRecipeForScrew(screw);
    const bossRadius = bossRadiusFor(screw);
    const positions = bossPositions(
      screw.count,
      Math.max(length / 2 - body.wallThickness, 0),
      Math.max(width / 2 - body.wallThickness, 0),
      bossRadius,
      screw.edgeInset,
    );
    const headKeepout = recipe.dimensions.headDiameter / 2 + 0.4;
    for (const [x, y] of positions) {
      inset = Math.max(
        inset,
        length / 2 - (Math.abs(x) - headKeepout),
        width / 2 - (Math.abs(y) - headKeepout),
      );
    }
  }

  const fieldLength = length - 2 * inset;
  const fieldWidth = width - 2 * inset;
  const minSpan = Math.max(rules.minRib * 4, 10);
  const depth = Math.min(0.8, Math.max(body.wallThickness - rules.minSkin, 0));
  // Epsilon guards the 0.2mm floor from floating-point noise in `wallThickness - minSkin` (e.g.
  // 2 - 1.8 === 0.19999999999999996 in IEEE754), which would otherwise reject an input sitting
  // exactly on the profile's own floor rather than genuinely below it.
  const DEPTH_EPSILON = 1e-6;
  if (fieldLength < minSpan || fieldWidth < minSpan || depth < 0.2 - DEPTH_EPSILON) return null;
  return {
    length: fieldLength,
    width: fieldWidth,
    depth,
    cornerRadius: Math.min(3, fieldLength / 4, fieldWidth / 4),
  };
}
