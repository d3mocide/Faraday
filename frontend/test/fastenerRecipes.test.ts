import { describe, expect, it } from 'vitest';
import { FASTENER_RECIPES, fastenerRecipeForScrew } from '../src/fasteners/library';
import { SCREW_HOLE_SPECS } from '../src/csg/screwLibrary';
import { createDefaultProject } from '../src/state/defaultProject';
import { useProjectStore } from '../src/state/projectStore';
import { isValidEnclosureProject } from '../src/state/projectValidation';

describe('fastener recipes', () => {
  it('resolves old size/insert lid data to the exact former starter dimensions', () => {
    const legacy = fastenerRecipeForScrew({ size: 'M3', insertType: 'heat-set', count: 4 });
    expect(legacy.id).toBe('starter-m3-heat-set');
    expect(legacy.dimensions).toEqual(SCREW_HOLE_SPECS.M3);
    expect(legacy.calibrated).toBe(false);
  });

  it('ships a complete, bounded starter option for each supported size and insert style', () => {
    expect(FASTENER_RECIPES).toHaveLength(8);
    expect(FASTENER_RECIPES.every((recipe) => recipe.referenceUrl.startsWith('https://'))).toBe(true);
  });

  it('records new-project and selected recipe intent while retaining the legacy fields', () => {
    expect(createDefaultProject().body.lid.screw?.recipeId).toBe('starter-m3-heat-set');
    useProjectStore.getState().loadProject(createDefaultProject());
    useProjectStore.getState().setScrewRecipe('starter-m2.5-self-tap');
    expect(useProjectStore.getState().project.body.lid.screw).toMatchObject({
      size: 'M2.5',
      insertType: 'self-tap',
      recipeId: 'starter-m2.5-self-tap',
    });
  });

  it('accepts legacy JSON but rejects a missing or mismatched recipe', () => {
    const legacy = createDefaultProject();
    if (legacy.body.lid.screw) delete legacy.body.lid.screw.recipeId;
    expect(isValidEnclosureProject(legacy)).toBe(true);

    const mismatch = createDefaultProject();
    if (mismatch.body.lid.screw) mismatch.body.lid.screw.recipeId = 'starter-m2-self-tap';
    expect(isValidEnclosureProject(mismatch)).toBe(false);
  });
});
