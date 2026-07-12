import type { EnclosureProject } from '../types/project';
import type { CsgQuality } from './generateEnclosure';
import type { CsgRequest, CsgResponse, MeshData } from './workerProtocol';

export interface EnclosureMeshes {
  base: MeshData;
  lid: MeshData;
}

interface PendingEntry {
  resolve: (r: EnclosureMeshes) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Backstop timeouts (ms). Not a hang-free guarantee -- the boolean kernel is robust and normally
 * either returns or throws -- but if the worker dies silently (WASM abort/OOM) with no error event,
 * this is what turns a frozen "Regenerating..." into a surfaced, recoverable failure. Generous on
 * purpose so a slow-but-working export never trips it. */
const DEFAULT_TIMEOUTS: Record<CsgQuality, number> = {
  live: 20_000,
  export: 90_000,
};

/** Thin request/response wrapper around the CSG web worker. */
export class CsgWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, PendingEntry>();

  // The worker is injectable so the request/response/timeout/failure logic can be exercised
  // headlessly with a fake worker; production always uses the default real one.
  constructor(worker: Worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })) {
    this.worker = worker;
    this.worker.onmessage = (event: MessageEvent<CsgResponse>) => {
      const msg = event.data;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.settle(msg.id);
      if (msg.type === 'result') {
        entry.resolve({ base: msg.base, lid: msg.lid });
      } else {
        entry.reject(new Error(msg.message));
      }
    };
    // A hard worker failure (WASM abort/OOM, a throw during module init) fires here and never
    // returns a per-request response, so without this every in-flight request would hang forever.
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.rejectAll(new Error(event.message || 'The geometry engine crashed. Try undoing your last change.'));
    };
    this.worker.onmessageerror = () => {
      this.rejectAll(new Error('The geometry engine sent an unreadable response.'));
    };
  }

  generate(
    project: EnclosureProject,
    quality: CsgQuality,
  ): { id: number; result: Promise<EnclosureMeshes> } {
    const id = this.nextId++;
    const result = new Promise<EnclosureMeshes>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.settle(id);
        reject(
          new Error('Geometry generation timed out. Your last change may have produced an invalid shape.'),
        );
      }, DEFAULT_TIMEOUTS[quality]);
      this.pending.set(id, { resolve, reject, timer });
    });
    const request: CsgRequest = { id, project, quality };
    this.worker.postMessage(request);
    return { id, result };
  }

  /** Removes a pending entry and clears its timeout. Does not resolve/reject -- caller does that. */
  private settle(id: number): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    if (entry.timer !== null) clearTimeout(entry.timer);
    this.pending.delete(id);
  }

  private rejectAll(error: Error): void {
    for (const [id, entry] of this.pending) {
      if (entry.timer !== null) clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.reject(error);
    }
  }

  terminate(): void {
    this.rejectAll(new Error('Geometry engine was shut down.'));
    this.worker.terminate();
  }
}
