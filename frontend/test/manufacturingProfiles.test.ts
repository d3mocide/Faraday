import { beforeAll, describe, expect, it } from 'vitest';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { generateEnclosure } from '../src/csg/generateEnclosure';
import { extractMeshData } from '../src/csg/manifoldToGeometry';
import { LEGACY_PRINT_RULES, printRulesForProfile } from '../src/csg/printRules';
import { manufacturingProfile, manufacturingProfileForProject } from '../src/state/manufacturingProfiles';
import { useProjectStore } from '../src/state/projectStore';
import { createDefaultProject } from '../src/state/defaultProject';
import { isValidEnclosureProject } from '../src/state/projectValidation';
import { runDesignChecks } from '../src/state/designChecks';
import { resolveBoardMountPlan } from '../src/csg/mountPlan';
import type { EnclosureProject, Feature } from '../src/types/project';
import { isWatertight } from './helpers/geometry';
import { getTestWasm } from './helpers/wasm';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await getTestWasm();
});

function boardMount(strategy: 'manual' | 'auto'): Feature {
  return {
    id: 'board',
    type: 'board-mount',
    face: 'bottom',
    u: 0.5,
    v: 0.5,
    rotationDeg: 0,
    board: {
      boardWidth: 68,
      boardDepth: 40,
      boardThickness: 1.6,
      holes: [{ x: 30, y: 16 }],
      standoff: { outerDiameter: 6, screwHoleDiameter: 2.2, height: 6 },
      mountStrategy: strategy,
    },
  };
}

function project(strategy: 'manual' | 'auto'): EnclosureProject {
  const base = createDefaultProject();
  return {
    ...base,
    body: {
      ...base.body,
      lid: { type: 'friction-lip', splitHeight: 24, wallGap: 0.2 },
    },
    features: [boardMount(strategy)],
  };
}

function solidAt(part: Manifold, [x, y, z]: [number, number, number], size = 0.5): boolean {
  const probe = wasm.Manifold.cube([size, size, size], true).translate(x, y, z);
  const hit = part.intersect(probe);
  const result = !hit.isEmpty();
  hit.delete();
  probe.delete();
  return result;
}

describe('manufacturing profiles', () => {
  it('resolves absent project data to exact legacy rules', () => {
    const profile = manufacturingProfileForProject({ manufacturingProfile: undefined });
    const rules = printRulesForProfile(profile);
    expect(profile.id).toBe('fdm-legacy-0.4');
    expect(rules).toEqual(LEGACY_PRINT_RULES);
  });

  it('keeps daily profiles explicitly uncalibrated and stronger than legacy', () => {
    const daily = manufacturingProfile('fdm-daily-petg-0.4');
    const dailyRules = printRulesForProfile(daily);
    expect(daily.calibrated).toBe(false);
    expect(dailyRules.minSkin).toBeGreaterThan(LEGACY_PRINT_RULES.minSkin);
    expect(dailyRules.minWall).toBeGreaterThan(LEGACY_PRINT_RULES.minWall);
  });

  it('accepts old project JSON and rejects unknown profiles', () => {
    const oldProject = createDefaultProject();
    delete oldProject.manufacturingProfile;
    expect(isValidEnclosureProject(oldProject)).toBe(true);
    expect(isValidEnclosureProject({ ...createDefaultProject(), manufacturingProfile: 'made-up' })).toBe(false);
  });

  it('persists an intentional profile selection through the project store', () => {
    useProjectStore.getState().loadProject(createDefaultProject());
    useProjectStore.getState().setManufacturingProfile('fdm-daily-pla-0.4');
    expect(useProjectStore.getState().project.manufacturingProfile).toBe('fdm-daily-pla-0.4');
  });

  it('uses the selected profile in design checks and marks unsupported auto ties', () => {
    const thinDailyProject: EnclosureProject = {
      ...project('manual'),
      manufacturingProfile: 'fdm-daily-pla-0.4',
      body: { ...project('manual').body, wallThickness: 1.2 },
    };
    expect(runDesignChecks(thinDailyProject).some((finding) => finding.id === 'body:wall-thickness')).toBe(true);

    const cylinderProject: EnclosureProject = {
      ...project('auto'),
      body: {
        shape: 'cylinder',
        outer: { diameter: 80, height: 30 },
        wallThickness: 2,
        lid: { type: 'friction-lip', splitHeight: 24, wallGap: 0.2 },
      },
    };
    expect(runDesignChecks(cylinderProject).some((finding) => finding.id === 'board:auto-ties-box-only')).toBe(true);
  });
});

describe('automatic board-post wall ties', () => {
  it('derives an explainable wall-rib and edge-support plan only for opt-in auto', () => {
    const manual = project('manual');
    const auto = project('auto');
    const manualPlan = resolveBoardMountPlan(manual.features[0], manual.body, LEGACY_PRINT_RULES);
    const autoPlan = resolveBoardMountPlan(auto.features[0], auto.body, LEGACY_PRINT_RULES);

    expect(manualPlan.posts[0].reinforcement).toBe('floor-post');
    expect(manualPlan.undersideSupport).toBeNull();
    expect(autoPlan.posts[0].reinforcement).toBe('wall-rib');
    expect(autoPlan.undersideSupport?.edge).toBe('left');
    expect(autoPlan.reasons.join(' ')).toMatch(/wall rib.*underside support row/i);
  });

  it('adds the derived wall tie and support row only for the opt-in auto strategy', () => {
    const manual = generateEnclosure(wasm, project('manual'), 'export');
    const auto = generateEnclosure(wasm, project('auto'), 'export');
    const manualBase = manual.parts.find((part) => part.id === 'base')!.manifold;
    const autoBase = auto.parts.find((part) => part.id === 'base')!.manifold;

    // The post sits at (30,16). Its nearest cavity wall is y=23, so (30,21,5) is clear in the
    // manual case but lies inside the short vertical web added by the auto resolver.
    expect(solidAt(manualBase, [30, 21, 5])).toBe(false);
    expect(solidAt(autoBase, [30, 21, 5])).toBe(true);
    // The board has only one hole, leaving its left edge materially cantilevered. Auto adds the
    // same two-pad row the explicit planner proposes, but keeps it derived rather than persisting
    // another user feature.
    expect(solidAt(manualBase, [-30, -12, 5])).toBe(false);
    expect(solidAt(autoBase, [-30, -12, 5])).toBe(true);
    expect(isWatertight(extractMeshData(autoBase))).toBe(true);

    for (const part of manual.parts) part.manifold.delete();
    for (const part of auto.parts) part.manifold.delete();
  });

  it('keeps a wall opening clear by choosing the next eligible reinforcement path', () => {
    const auto = project('auto');
    auto.features.push({
      id: 'rear-port',
      type: 'custom-hole',
      face: 'back',
      u: 0.875,
      v: 0.17,
      rotationDeg: 0,
      custom: { shape: 'rect', width: 8, height: 8 },
    });
    const plan = resolveBoardMountPlan(auto.features[0], auto.body, LEGACY_PRINT_RULES, auto.features);
    expect(plan.posts[0].keepoutAvoided).toBe(true);
    expect(plan.posts[0].tie?.axis).toBe('x');
    expect(plan.reasons.join(' ')).toMatch(/keep-out redirected/i);

    const result = generateEnclosure(wasm, auto, 'export');
    const base = result.parts.find((part) => part.id === 'base')!.manifold;
    // The port's opening is genuinely clear at the old rear-wall tie position, not bridged by it.
    expect(solidAt(base, [30, 21, 5])).toBe(false);
    expect(isWatertight(extractMeshData(base))).toBe(true);
    for (const part of result.parts) part.manifold.delete();
  });

  it('uses a continuous rail for automatic board-edge support while keeping manual pad rows gapped', () => {
    const auto = project('auto');
    const autoResult = generateEnclosure(wasm, auto, 'export');
    const autoBase = autoResult.parts.find((part) => part.id === 'base')!.manifold;
    // The automatic two-pad support occupies its span as one rail, so the midpoint bears on the
    // board too instead of leaving a flex point between pads.
    expect(solidAt(autoBase, [-30, 0, 5])).toBe(true);

    const manual = project('manual');
    manual.features.push({
      id: 'gapped-row',
      type: 'support-pad',
      face: 'bottom',
      u: 0.125,
      v: 0.5,
      rotationDeg: 0,
      pad: { shape: 'rect', width: 6, depth: 5, height: 6, count: 2, pitch: 20, axis: 'v' },
    });
    const manualResult = generateEnclosure(wasm, manual, 'export');
    const manualBase = manualResult.parts.find((part) => part.id === 'base')!.manifold;
    expect(solidAt(manualBase, [-30, 0, 5])).toBe(false);

    for (const part of autoResult.parts) part.manifold.delete();
    for (const part of manualResult.parts) part.manifold.delete();
  });
});
