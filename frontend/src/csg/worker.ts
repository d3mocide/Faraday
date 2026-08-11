/// <reference lib="webworker" />
import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { garbageCollectManifold, cleanup } from 'manifold-3d/lib/garbage-collector';
import { generateEnclosure, orientPartForPrint } from './generateEnclosure';
import { extractMeshData } from './manifoldToGeometry';
import type { CsgRequest, CsgResponse, PartMesh } from './workerProtocol';

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
