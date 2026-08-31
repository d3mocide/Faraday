import type { FastenerRecipeId, ScrewInsertType, ScrewSize, ScrewSpec } from '../types/project';

export interface FastenerDimensions {
  clearanceDiameter: number;
  selfTapPilotDiameter: number;
  heatSetHoleDiameter: number;
  heatSetDepth: number;
  headDiameter: number;
}

/** A named, inspectable starter geometry recipe. These are deliberately uncalibrated: the source
 * explains insert-boss topology, while exact vendor fit still needs a coupon on the target printer. */
export interface FastenerRecipe {
  id: FastenerRecipeId;
  label: string;
  size: ScrewSize;
  insertType: ScrewInsertType;
  calibrated: false;
  dimensions: FastenerDimensions;
  referenceLabel: string;
  referenceUrl: string;
}

const DIMENSIONS: Record<ScrewSize, FastenerDimensions> = {
  M2: { clearanceDiameter: 2.4, selfTapPilotDiameter: 1.6, heatSetHoleDiameter: 3.2, heatSetDepth: 3.0, headDiameter: 3.8 },
  'M2.5': { clearanceDiameter: 2.9, selfTapPilotDiameter: 2.0, heatSetHoleDiameter: 3.5, heatSetDepth: 4.0, headDiameter: 4.5 },
  M3: { clearanceDiameter: 3.4, selfTapPilotDiameter: 2.5, heatSetHoleDiameter: 4.0, heatSetDepth: 5.0, headDiameter: 5.5 },
  M4: { clearanceDiameter: 4.5, selfTapPilotDiameter: 3.3, heatSetHoleDiameter: 5.6, heatSetDepth: 6.0, headDiameter: 7.0 },
};

const REFERENCE_LABEL = 'SPIROL 3D-printed insert design guidance';
const REFERENCE_URL = 'https://www.spirol.com/resources/white-papers/how-to-design-the-proper-hole-for-heat-ultrasonic-inserts/';

function starterRecipe(size: ScrewSize, insertType: ScrewInsertType): FastenerRecipe {
  return {
    id: `starter-${size.toLowerCase()}-${insertType}` as FastenerRecipeId,
    label: `${size} ${insertType === 'heat-set' ? 'heat-set insert' : 'self-tapping screw'} — starter`,
    size,
    insertType,
    calibrated: false,
    dimensions: DIMENSIONS[size],
    referenceLabel: REFERENCE_LABEL,
    referenceUrl: REFERENCE_URL,
  };
}

export const FASTENER_RECIPES: readonly FastenerRecipe[] = [
  starterRecipe('M2', 'heat-set'),
  starterRecipe('M2', 'self-tap'),
  starterRecipe('M2.5', 'heat-set'),
  starterRecipe('M2.5', 'self-tap'),
  starterRecipe('M3', 'heat-set'),
  starterRecipe('M3', 'self-tap'),
  starterRecipe('M4', 'heat-set'),
  starterRecipe('M4', 'self-tap'),
];

export function fastenerRecipe(id: FastenerRecipeId): FastenerRecipe {
  const recipe = FASTENER_RECIPES.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`Unknown fastener recipe: ${id}`);
  return recipe;
}

/** Safely resolves old size/insert projects to the exact dimensions they used before recipes. */
export function fastenerRecipeForScrew(screw: ScrewSpec): FastenerRecipe {
  if (screw.recipeId) {
    const selected = fastenerRecipe(screw.recipeId);
    if (selected.size === screw.size && selected.insertType === screw.insertType) return selected;
  }
  return fastenerRecipe(`starter-${screw.size.toLowerCase()}-${screw.insertType}` as FastenerRecipeId);
}
