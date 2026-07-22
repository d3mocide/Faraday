import { describe, it, expect, beforeAll } from 'vitest';
import type { ManifoldToplevel } from 'manifold-3d';
import { generateEnclosure } from '../src/csg/generateEnclosure';
import { extractMeshData } from '../src/csg/manifoldToGeometry';
import { findConnector } from '../src/connectors/library';
import { bossPositions, bossRadiusFor } from '../src/csg/primitives';
import { BOARD_PRESETS, type BoardPreset } from '../src/presets/boards';
import { buildPresetFeatures } from '../src/state/featureFactory';
import type { EnclosureProject, ScrewSpec } from '../src/types/project';
import { getTestWasm } from './helpers/wasm';
import { isWatertight } from './helpers/geometry';

// The app's actual default project screw (state/defaultProject.ts) -- also the worst case for
// boss-vs-board clearance, since it has the largest boss of the three screw sizes. A fresh
// project applying any board preset gets exactly this, so it's what the clearance check below
// verifies against.
const DEFAULT_SCREW: ScrewSpec = { size: 'M3', insertType: 'heat-set', count: 4 };

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await getTestWasm();
});

/** Mirrors what applyBoardPreset produces in the store: preset body + prebuilt features. */
function projectFromPreset(preset: BoardPreset): EnclosureProject {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: preset.id,
    name: preset.label,
    units: 'mm',
    createdAt: now,
    updatedAt: now,
    body: {
      shape: 'box',
      outer: preset.body.outer,
      wallThickness: preset.body.wallThickness,
      cornerStyle: { type: 'rounded', radius: 3 },
      lid: {
        type: 'screw-boss',
        splitHeight: preset.body.splitHeight,
        wallGap: 0.2,
        screw: { size: 'M2.5', insertType: 'heat-set', count: 4 },
        gasket: preset.body.gasket,
      },
    },
    features: buildPresetFeatures(preset),
  };
}

describe('board preset IO layouts', () => {
  it('every io connectorId resolves in the connector library', () => {
    for (const preset of BOARD_PRESETS) {
      for (const port of preset.io ?? []) {
        if (port.connectorId) {
          expect(findConnector(port.connectorId), `${preset.id}: ${port.connectorId}`).toBeDefined();
        }
        expect(port.connectorId || port.custom, `${preset.id}: port needs a shape`).toBeTruthy();
      }
    }
  });

  it('every preset with io produces a board-mount or is a documented board-less starter', () => {
    // Board-less presets (no boardMount) measure their io ports from the interior floor instead
    // of a board's top surface -- see buildPresetFeatures in featureFactory.ts. The sealed outdoor
    // node has no board at all; the Jetson devkit and XIAO ESP32 have a real board but ship without
    // a boardMount because there's genuinely no mounting-hole pattern to place (Jetson: NVIDIA's
    // docs don't dimension one; XIAO: the board has no mounting holes at all, by design -- see each
    // preset's notes). Anything else with io but no boardMount is probably a mistake (a board
    // preset missing its mount pattern).
    const knownBoardless = new Set(['sealed-outdoor-node', 'jetson-orin-nano-devkit', 'seeed-xiao-esp32']);
    for (const preset of BOARD_PRESETS) {
      if (preset.io && !preset.boardMount) {
        expect(knownBoardless.has(preset.id), `${preset.id} has io but no boardMount`).toBe(true);
      }
    }
  });

  it('every cutout lands inside its face and below the lid split', () => {
    for (const preset of BOARD_PRESETS) {
      for (const feature of buildPresetFeatures(preset)) {
        expect(feature.u, `${preset.id}/${feature.type} u`).toBeGreaterThan(0);
        expect(feature.u, `${preset.id}/${feature.type} u`).toBeLessThan(1);
        expect(feature.v, `${preset.id}/${feature.type} v`).toBeGreaterThan(0);
        expect(feature.v, `${preset.id}/${feature.type} v`).toBeLessThan(1);
        if (feature.type === 'connector-cutout' && feature.connectorId) {
          // The whole opening (not just its centerline) must clear the seam, or the lid would
          // need a matching notch the preset doesn't cut.
          const entry = findConnector(feature.connectorId)!;
          const halfH = (entry.height ?? entry.diameter ?? 0) / 2;
          const centerZ = feature.v * preset.body.outer.height;
          expect(centerZ + halfH, `${preset.id}/${feature.connectorId} top vs split`).toBeLessThan(
            preset.body.splitHeight,
          );
          expect(centerZ - halfH, `${preset.id}/${feature.connectorId} bottom vs floor`).toBeGreaterThan(0);
        }
      }
    }
  });

  for (const preset of BOARD_PRESETS.filter((p) => p.boardMount)) {
    it(`${preset.id}: lid screw bosses (default M3 heat-set) clear the board footprint`, () => {
      // Lid screw bosses and board-mount standoffs are two independent solids, both rising from
      // the floor -- a boss union'd right on top of where the board itself sits is still a valid
      // (watertight) manifold, so the export-quality watertightness test below can't catch this;
      // it's a design/assembly conflict, not a geometry error. Checked in plain 2D here (no CSG
      // needed) by reusing the app's own boss-placement math, not a re-derived approximation.
      const { outer, wallThickness } = preset.body;
      const innerLength = outer.length - 2 * wallThickness;
      const innerWidth = outer.width - 2 * wallThickness;
      const bossRadius = bossRadiusFor(DEFAULT_SCREW);
      const positions = bossPositions(DEFAULT_SCREW.count, innerLength / 2, innerWidth / 2, bossRadius);
      const board = preset.boardMount!;
      const halfW = board.boardWidth / 2;
      const halfD = board.boardDepth / 2;
      const minClearance = 1; // mm of air gap wanted between the board edge and the boss body
      for (const [bx, by] of positions) {
        const dx = Math.max(Math.abs(bx) - halfW, 0);
        const dy = Math.max(Math.abs(by) - halfD, 0);
        const distanceFromBoard = Math.hypot(dx, dy);
        expect(
          distanceFromBoard,
          `${preset.id}: boss at (${bx.toFixed(1)}, ${by.toFixed(1)}) is only ${distanceFromBoard.toFixed(1)}mm from the ${board.boardWidth}x${board.boardDepth}mm board (needs >= ${(bossRadius + minClearance).toFixed(1)}mm)`,
        ).toBeGreaterThanOrEqual(bossRadius + minClearance);
      }
    });
  }

  for (const preset of BOARD_PRESETS.filter((p) => p.boardMount || (p.io && p.io.length > 0))) {
    it(`${preset.id}: full preset generates watertight base + lid`, () => {
      const result = generateEnclosure(wasm, projectFromPreset(preset), 'export');
      const base = extractMeshData(result.base);
      const lid = extractMeshData(result.lid);
      result.base.delete();
      result.lid.delete();
      expect(isWatertight(base), 'base watertight').toBe(true);
      expect(isWatertight(lid), 'lid watertight').toBe(true);
    });
  }
});
