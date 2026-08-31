import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { fastenerRecipeForScrew } from '../fasteners/library';
import type { EnclosureProject } from '../types/project';
import { manufacturingProfileForProject } from '../state/manufacturingProfiles';
import { printRulesForProfile } from './printRules';
import { cylinderZ } from './primitives';

export interface CalibrationCouponSolid {
  id: string;
  label: string;
  manifold: Manifold;
}

/** Printable measurement artefacts, not a promise that one value fits every printer. Each uses
 * the active profile's line and skin floors; the accompanying manifest tells the operator exactly
 * what to measure before a profile can be trusted. */
export function generateCalibrationCoupons(
  wasm: ManifoldToplevel,
  project: EnclosureProject,
): CalibrationCouponSolid[] {
  const rules = printRulesForProfile(manufacturingProfileForProject(project));
  const screw = project.body.lid.screw ?? { size: 'M3', insertType: 'heat-set', count: 4 as const };
  const recipe = fastenerRecipeForScrew(screw);
  const skin = Math.max(rules.minSkin, 1);

  const fitMale = fitTabsCoupon(wasm, skin);
  const fitFemale = fitSlotsCoupon(wasm, skin);
  const insert = insertBossCoupon(wasm, skin, recipe.dimensions.heatSetHoleDiameter, recipe.dimensions.heatSetDepth);
  const ports = portGaugeCoupon(wasm, skin);
  const snap = snapBeamCoupon(wasm, skin);
  return [
    { id: 'fit_tabs', label: 'Fit-ladder tabs', manifold: fitMale },
    { id: 'fit_slots', label: 'Fit-ladder slots', manifold: fitFemale },
    { id: 'insert_boss', label: `${recipe.size} insert boss`, manifold: insert },
    { id: 'port_gauge', label: 'Port clearance gauge', manifold: ports },
    { id: 'snap_beam', label: 'Snap-beam flex coupon', manifold: snap },
  ];
}

function fitTabsCoupon(wasm: ManifoldToplevel, skin: number): Manifold {
  let solid = wasm.Manifold.cube([78, 18, skin], true);
  for (let index = 0; index < 5; index++) {
    const x = -28 + index * 14;
    solid = solid.add(wasm.Manifold.cube([8, 10, skin * 2], true).translate(x, 0, skin));
  }
  return solid.translate(0, 0, skin / 2);
}

function fitSlotsCoupon(wasm: ManifoldToplevel, skin: number): Manifold {
  let solid = wasm.Manifold.cube([78, 18, skin * 2], true).translate(0, 0, skin);
  const clearances = [0.1, 0.15, 0.2, 0.25, 0.3];
  for (let index = 0; index < clearances.length; index++) {
    const x = -28 + index * 14;
    solid = solid.subtract(
      wasm.Manifold.cube([8 + clearances[index] * 2, 10 + clearances[index] * 2, skin * 3], true).translate(x, 0, skin),
    );
  }
  return solid;
}

function insertBossCoupon(
  wasm: ManifoldToplevel,
  skin: number,
  boreDiameter: number,
  insertDepth: number,
): Manifold {
  const base = wasm.Manifold.cube([30, 30, skin], true).translate(0, 0, skin / 2);
  const height = Math.max(insertDepth + skin + 1.5, 6);
  const outerDiameter = Math.max(boreDiameter + 2 * skin, 6);
  const boss = cylinderZ(wasm, outerDiameter, height, skin);
  const bore = cylinderZ(wasm, boreDiameter, Math.min(insertDepth + 1.5, height - skin / 2), skin + height - Math.min(insertDepth + 1.5, height - skin / 2));
  return base.add(boss.subtract(bore));
}

function portGaugeCoupon(wasm: ManifoldToplevel, skin: number): Manifold {
  let plate = wasm.Manifold.cube([64, 38, skin * 2], true).translate(0, 0, skin);
  for (const [x, diameter] of [[-24, 3], [-12, 5], [0, 6.5], [12, 8]] as const) {
    plate = plate.subtract(cylinderZ(wasm, diameter, skin * 3, 0).translate(x, -8, 0));
  }
  const usbC = wasm.CrossSection.square([9, 3.5], true).offset(0.8, 'Round').extrude(skin * 3);
  return plate.subtract(usbC.translate(20, 9, 0));
}

function snapBeamCoupon(wasm: ManifoldToplevel, skin: number): Manifold {
  const base = wasm.Manifold.cube([70, 20, skin], true).translate(0, 0, skin / 2);
  const beamThickness = Math.max(rulesafe(skin * 0.75), 0.8);
  const root = wasm.Manifold.cube([6, 10, beamThickness * 2], true).translate(-28, 0, skin + beamThickness);
  const beam = wasm.Manifold.cube([48, beamThickness, beamThickness * 2], true).translate(-4, 0, skin + beamThickness * 2);
  const hook = wasm.Manifold.cube([4, 6, beamThickness * 2], true).translate(20, 0, skin + beamThickness * 3);
  return base.add(root).add(beam).add(hook);
}

function rulesafe(value: number): number {
  return Math.max(value, 0.2);
}
