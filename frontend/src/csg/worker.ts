/// <reference lib="webworker" />
import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { garbageCollectManifold, cleanup } from 'manifold-3d/lib/garbage-collector';
import { generateEnclosure, orientLidForPrint } from './generateEnclosure';
import { extractMeshData } from './manifoldToGeometry';
import type { CsgRequest, CsgResponse } from './workerProtocol';

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

self.onmessage = async (event: MessageEvent<CsgRequest>) => {
  const { id, project, quality } = event.data;
  try {
    const wasm = await getWasm();
    const result = generateEnclosure(wasm, project, quality);
    const lidForOutput =
      quality === 'export'
        ? orientLidForPrint(result.lid, result.splitHeight, result.outerHeight)
        : result.lid;

    const base = extractMeshData(result.base);
    const lid = extractMeshData(lidForOutput);

    const response: CsgResponse = { id, type: 'result', base, lid };
    self.postMessage(response, [
      base.positions.buffer,
      base.indices.buffer,
      lid.positions.buffer,
      lid.indices.buffer,
    ]);
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
