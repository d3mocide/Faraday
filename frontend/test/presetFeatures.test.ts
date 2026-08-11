import { describe, it, expect, beforeAll } from 'vitest';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { generateEnclosure } from '../src/csg/generateEnclosure';
import { extractMeshData } from '../src/csg/manifoldToGeometry';
import { findConnector } from '../src/connectors/library';
import { bossPositions, bossRadiusFor } from '../src/csg/primitives';
import { featurePart } from '../src/csg/parts';
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
        type: preset.body.lidType ?? 'screw-boss',
        splitHeight: preset.body.splitHeight,
        wallGap: 0.2,
        screw: {
          size: 'M2.5',
          insertType: 'heat-set',
          count: 4,
          placement: preset.body.screwPlacement,
        },
        gasket: preset.body.gasket,
      },
      panels: preset.body.panels,
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
        expect(
          port.connectorId || port.custom || port.vent || port.mount,
          `${preset.id}: wall feature needs a shape`,
        ).toBeTruthy();
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
        // Horizontal faces (a fan grille in the lid, feet under the floor) put an in-plane
        // coordinate in v, not a height, so the floor/split check below doesn't apply to them.
        if (feature.face === 'top' || feature.face === 'bottom') continue;
        if (feature.type === 'connector-cutout' && feature.connectorId) {
          // The whole opening (not just its centerline) must clear the seam, or the lid would
          // need a matching notch the preset doesn't cut.
          const entry = findConnector(feature.connectorId)!;
          const override = feature.connectorOverride;
          const halfH =
            (override?.height ?? override?.diameter ?? entry.height ?? entry.diameter ?? 0) / 2;
          const centerZ = feature.v * preset.body.outer.height;
          expect(centerZ + halfH, `${preset.id}/${feature.connectorId} top vs split`).toBeLessThan(
            preset.body.splitHeight,
          );
          expect(centerZ - halfH, `${preset.id}/${feature.connectorId} bottom vs floor`).toBeGreaterThan(0);
        }
      }
    }
  });

  // Presets that put their screw columns outside the walls are exempt: the check below is about
  // interior bosses landing on the board, and an exterior column never can. That placement exists
  // precisely for boards that leave no interior clearance (see the Waveshare CM4 preset).
  for (const preset of BOARD_PRESETS.filter((p) => p.boardMount && p.body.screwPlacement !== 'exterior')) {
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
    it(`${preset.id}: full preset generates watertight parts`, () => {
      const result = generateEnclosure(wasm, projectFromPreset(preset), 'export');
      for (const part of result.parts) {
        const mesh = extractMeshData(part.manifold);
        part.manifold.delete();
        expect(isWatertight(mesh), `${part.id} watertight`).toBe(true);
      }
    });
  }
});

describe('waveshare CM4 dual-ETH preset: the multi-part case', () => {
  const preset = BOARD_PRESETS.find((p) => p.id === 'waveshare-cm4-dual-eth-wifi6')!;

  it('prints as four pieces: tray, lid and two end plates', () => {
    const result = generateEnclosure(wasm, projectFromPreset(preset), 'export');
    const ids = result.parts.map((p) => p.id).sort();
    for (const part of result.parts) part.manifold.delete();
    expect(ids).toEqual(['base', 'lid', 'panel-left', 'panel-right']);
  });

  it('routes every port on an end wall to that end plate', () => {
    const project = projectFromPreset(preset);
    const endPorts = project.features.filter((f) => f.face === 'left' || f.face === 'right');
    expect(endPorts.length).toBeGreaterThan(15);
    for (const feature of endPorts) {
      expect(featurePart(feature, project.body), `${feature.connectorId ?? feature.type}`).toBe(
        feature.face === 'left' ? 'panel-left' : 'panel-right',
      );
    }
  });

  it('keeps the fan grille on the lid and the wall tabs on the tray', () => {
    const project = projectFromPreset(preset);
    const lidFeatures = project.features.filter((f) => f.face === 'top');
    expect(lidFeatures).toHaveLength(5); // honeycomb grille + 4 fan screws
    for (const feature of lidFeatures) {
      expect(featurePart(feature, project.body)).toBe('lid');
    }

    const tabs = project.features.filter((f) => f.type === 'external-mount');
    expect(tabs).toHaveLength(4);
    for (const tab of tabs) {
      expect(tab.mount?.hole).toBe('slot');
      expect(featurePart(tab, project.body)).toBe('base');
    }
  });

  it('every board-relative port sits where the source model measured it', () => {
    // Spot-check the round trip from board-relative mm to normalized (u,v): the USB-C on the left
    // plate is 41.47mm past the board center along +Y and 1.7mm above the board's top surface,
    // which sits 8mm off the interior floor (2.4 floor + 4 standoff + 1.6 PCB).
    const project = projectFromPreset(preset);
    const usbc = project.features.find((f) => f.connectorId === 'usb-c-panel')!;
    expect(usbc.face).toBe('left');
    expect(usbc.u * preset.body.outer.width - preset.body.outer.width / 2).toBeCloseTo(41.47, 3);
    expect(usbc.v * preset.body.outer.height).toBeCloseTo(9.7, 3);
  });
});

describe('waveshare CM4 dual-ETH preset: openings land where the source model measured them', () => {
  const preset = BOARD_PRESETS.find((p) => p.id === 'waveshare-cm4-dual-eth-wifi6')!;

  /** Is there material at this world point? Probes the part with a 0.8mm cube. */
  function solidAt(part: Manifold, [x, y, z]: [number, number, number]): boolean {
    const probe = wasm.Manifold.cube([0.8, 0.8, 0.8], true).translate(x, y, z);
    const hit = part.intersect(probe);
    const empty = hit.isEmpty();
    hit.delete();
    probe.delete();
    return !empty;
  }

  it('drills each end-plate port through the plate at its measured height', () => {
    const result = generateEnclosure(wasm, projectFromPreset(preset), 'export');
    const plates = new Map(result.parts.filter((p) => p.kind === 'panel').map((p) => [p.face!, p.manifold]));
    // Mid-thickness of each plate: the plate's outer face is flush with the case wall.
    const midX = preset.body.outer.length / 2 - preset.body.panels!.thickness / 2;
    const boardTopZ = 2.4 + 4 + 1.6;

    // [face, alongMm, aboveBoardMm, a clear-of-everything offset to probe for material]
    const checks: Array<[('left' | 'right'), number, number, number]> = [
      ['left', 41.47, 1.7, 4], // USB-C
      ['left', 14.725, 26, -6], // one of the four SMA bulkheads
      ['left', -12.975, 1, 5], // microSD slot
      ['right', 35.83, 7.1, 10], // dual RJ45
      ['right', -43.745, 3.5, 8], // HDMI 0
      ['right', -6.035, 6.75, 12], // first vertical USB-A
    ];

    for (const [face, alongMm, aboveBoardMm, solidOffset] of checks) {
      const plate = plates.get(face)!;
      const x = face === 'right' ? midX : -midX;
      const z = boardTopZ + aboveBoardMm;
      expect(solidAt(plate, [x, alongMm, z]), `${face} @${alongMm} should be open`).toBe(false);
      expect(
        solidAt(plate, [x, alongMm, z + solidOffset]),
        `${face} @${alongMm} should be plate material ${solidOffset}mm above the port`,
      ).toBe(true);
    }

    for (const part of result.parts) part.manifold.delete();
  });
});
