import type { EnclosureProject } from '../types/project';
import type { CsgQuality } from './generateEnclosure';
import type { CsgRequest, CsgResponse, MeshData } from './workerProtocol';

export interface EnclosureMeshes {
  base: MeshData;
  lid: MeshData;
}

/** Thin request/response wrapper around the CSG web worker. */
export class CsgWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (r: EnclosureMeshes) => void; reject: (e: Error) => void }
  >();

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<CsgResponse>) => {
      const msg = event.data;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.type === 'result') {
        entry.resolve({ base: msg.base, lid: msg.lid });
      } else {
        entry.reject(new Error(msg.message));
      }
    };
  }

  generate(project: EnclosureProject, quality: CsgQuality): { id: number; result: Promise<EnclosureMeshes> } {
    const id = this.nextId++;
    const result = new Promise<EnclosureMeshes>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    const request: CsgRequest = { id, project, quality };
    this.worker.postMessage(request);
    return { id, result };
  }

  terminate(): void {
    this.worker.terminate();
  }
}
