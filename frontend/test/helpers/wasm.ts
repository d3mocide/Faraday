import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';

// Manifold's WASM init is a few hundred ms; load it once and share it across the whole run.
let wasmPromise: Promise<ManifoldToplevel> | null = null;

export function getTestWasm(): Promise<ManifoldToplevel> {
  if (!wasmPromise) {
    // In Node, Emscripten locates manifold.wasm next to manifold.js on its own -- no locateFile.
    wasmPromise = Module().then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return wasmPromise;
}
