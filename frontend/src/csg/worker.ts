/// <reference lib="webworker" />
import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { garbageCollectManifold, cleanup } from 'manifold-3d/lib/garbage-collector';
import { generateEnclosure, orientPartForPrint } from './generateEnclosure';
import { generateCalibrationCoupons } from './calibrationCoupons';
import { extractMeshData } from './manifoldToGeometry';
import type { CalibrationRequest, CsgRequest, CsgResponse, PartMesh } from './workerProtocol';

let wasmPromise: Promise<ManifoldToplevel> | null = null;

function getWasm(): Promise<ManifoldToplevel> {
  if (!wasmPromise) {
    wasmPromise = Module({ locateFile: () => wasmUrl }).then((wasm) => {
      wasm.setup();
      garbageCollectManifold(wasm);
      return wasm;
    });
  }
  return wasmPromise;
}

self.onmessage = async (event: MessageEvent<CsgRequest | CalibrationRequest>) => {
  const request = event.data;
  const { id, project } = request;
  try {
    const wasm = await getWasm();
    if (!('quality' in request)) {
      const coupons = generateCalibrationCoupons(wasm, project).map((coupon) => {
        const mesh = extractMeshData(coupon.manifold);
        coupon.manifold.delete();
        return { id: coupon.id, label: coupon.label, mesh };
      });
      const response: CsgResponse = { id, type: 'calibration-result', coupons };
      self.postMessage(
        response,
        coupons.flatMap((coupon) => [coupon.mesh.positions.buffer, coupon.mesh.indices.buffer]),
      );
      return;
    }

    const { quality } = request;
    const result = generateEnclosure(wasm, project, quality);

    const parts: PartMesh[] = result.parts.map((part) => ({
      id: part.id,
      label: part.label,
      kind: part.kind,
      face: part.face,
      mesh: extractMeshData(quality === 'export' ? orientPartForPrint(part, result) : part.manifold),
    }));

    const response: CsgResponse = { id, type: 'result', parts };
    self.postMessage(
      response,
      parts.flatMap((p) => [p.mesh.positions.buffer, p.mesh.indices.buffer]),
    );
  } catch (err) {
    const response: CsgResponse = {
      id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  } finally {
    cleanup();
  }
};
