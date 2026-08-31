import { beforeAll, describe, expect, it } from 'vitest';
import type { ManifoldToplevel } from 'manifold-3d';
import { generateCalibrationCoupons } from '../src/csg/calibrationCoupons';
import { extractMeshData } from '../src/csg/manifoldToGeometry';
import { createDefaultProject } from '../src/state/defaultProject';
import { isWatertight } from './helpers/geometry';
import { getTestWasm } from './helpers/wasm';

let wasm: ManifoldToplevel;
beforeAll(async () => {
  wasm = await getTestWasm();
});

describe('calibration coupons', () => {
  it('generates the complete printable pack as watertight solids', () => {
    const coupons = generateCalibrationCoupons(wasm, createDefaultProject());
    expect(coupons.map((coupon) => coupon.id)).toEqual([
      'fit_tabs',
      'fit_slots',
      'insert_boss',
      'port_gauge',
      'snap_beam',
    ]);
    for (const coupon of coupons) {
      expect(isWatertight(extractMeshData(coupon.manifold)), coupon.id).toBe(true);
      coupon.manifold.delete();
    }
  });
});
