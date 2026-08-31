import { beforeAll, describe, expect, it } from 'vitest';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { generateEnclosure } from '../src/csg/generateEnclosure';
import { extractMeshData } from '../src/csg/manifoldToGeometry';
import { resolveLidSeamReveal, resolveRefinedLidField } from '../src/csg/lidTreatment';
import { printRulesForProfile } from '../src/csg/printRules';
import { createDefaultProject } from '../src/state/defaultProject';
import { manufacturingProfileForProject } from '../src/state/manufacturingProfiles';
import { runDesignChecks } from '../src/state/designChecks';
import { isWatertight } from './helpers/geometry';
import { getTestWasm } from './helpers/wasm';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await getTestWasm();
});

function solidAt(part: Manifold, [x, y, z]: [number, number, number], size = 0.3): boolean {
  const probe = wasm.Manifold.cube([size, size, size], true).translate(x, y, z);
  const hit = part.intersect(probe);
  const result = !hit.isEmpty();
  hit.delete();
  probe.delete();
  return result;
}

describe('refined lid treatment', () => {
  it('is opt-in, preserves a structural skin, and exports a watertight recessed lid', () => {
    const plain = createDefaultProject();
    if (plain.body.shape !== 'box') throw new Error('default project must stay a box');
    const refined = {
      ...plain,
      body: { ...plain.body, lid: { ...plain.body.lid, surfaceTreatment: 'refined' as const } },
    };
    const field = resolveRefinedLidField(
      refined.body,
      printRulesForProfile(manufacturingProfileForProject(refined)),
    );
    expect(field).not.toBeNull();

    const plainResult = generateEnclosure(wasm, plain, 'export');
    const refinedResult = generateEnclosure(wasm, refined, 'export');
    const plainLid = plainResult.parts.find((part) => part.id === 'lid')!.manifold;
    const refinedLid = refinedResult.parts.find((part) => part.id === 'lid')!.manifold;
    const top = plain.body.outer.height;
    expect(solidAt(plainLid, [0, 0, top - 0.15])).toBe(true);
    expect(solidAt(refinedLid, [0, 0, top - 0.15])).toBe(false);
    expect(solidAt(refinedLid, [0, 0, top - field!.depth - 0.25])).toBe(true);
    expect(isWatertight(extractMeshData(refinedLid))).toBe(true);

    for (const part of plainResult.parts) part.manifold.delete();
    for (const part of refinedResult.parts) part.manifold.delete();
  });

  it('warns instead of cutting a fragile field into an undersized box', () => {
    const project = createDefaultProject();
    if (project.body.shape !== 'box') throw new Error('default project must stay a box');
    project.body = {
      ...project.body,
      outer: { ...project.body.outer, length: 30, width: 30 },
      lid: { ...project.body.lid, surfaceTreatment: 'refined' },
    };
    expect(runDesignChecks(project).some((finding) => finding.id === 'lid:refined-field-unavailable')).toBe(true);
  });

  it('keeps the nominal 0.2mm Daily-profile field instead of losing it to floating-point noise', () => {
    const project = createDefaultProject();
    if (project.body.shape !== 'box') throw new Error('default project must stay a box');
    project.manufacturingProfile = 'fdm-daily-pla-0.4';
    project.body = {
      ...project.body,
      lid: { ...project.body.lid, surfaceTreatment: 'refined' },
    };
    const field = resolveRefinedLidField(
      project.body,
      printRulesForProfile(manufacturingProfileForProject(project)),
    );
    expect(field).not.toBeNull();
    expect(field!.depth).toBeCloseTo(0.2, 6);
  });

  it('adds a watertight perimeter reveal only for the field-marked style', () => {
    const plain = createDefaultProject();
    if (plain.body.shape !== 'box') throw new Error('default project must stay a box');
    const marked = {
      ...plain,
      body: { ...plain.body, wallThickness: 2.4, lid: { ...plain.body.lid, surfaceTreatment: 'field-marked' as const } },
    };
    const rules = printRulesForProfile(manufacturingProfileForProject(marked));
    const reveal = resolveLidSeamReveal(marked.body, rules);
    expect(reveal).not.toBeNull();

    const plainResult = generateEnclosure(wasm, plain, 'export');
    const markedResult = generateEnclosure(wasm, marked, 'export');
    const plainLid = plainResult.parts.find((part) => part.id === 'lid')!.manifold;
    const markedLid = markedResult.parts.find((part) => part.id === 'lid')!.manifold;
    const z = reveal!.bottomZ + reveal!.height / 2;
    expect(solidAt(plainLid, [plain.body.outer.length / 2 - 0.1, 0, z])).toBe(true);
    expect(solidAt(markedLid, [marked.body.outer.length / 2 - 0.1, 0, z])).toBe(false);
    expect(solidAt(markedLid, [marked.body.outer.length / 2 - reveal!.depth - 0.2, 0, z])).toBe(true);
    expect(isWatertight(extractMeshData(markedLid))).toBe(true);

    for (const part of plainResult.parts) part.manifold.delete();
    for (const part of markedResult.parts) part.manifold.delete();
  });
});
