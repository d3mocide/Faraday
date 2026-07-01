import { useEffect, useRef, useState } from 'react';
import type { EnclosureProject } from '../types/project';
import { CsgWorkerClient, type EnclosureMeshes } from './CsgWorkerClient';

const DEBOUNCE_MS = 150;

interface LiveGeometryState {
  meshes: EnclosureMeshes | null;
  error: string | null;
  isGenerating: boolean;
}

/** Debounced live (coarse) CSG regeneration, dispatched to the worker on every project change. */
export function useLiveGeometry(project: EnclosureProject): LiveGeometryState & {
  client: CsgWorkerClient | null;
} {
  // Created inside an effect (not a render-phase state initializer) so that
  // under StrictMode's dev-only mount->cleanup->mount cycle, each Worker
  // instance is torn down by its own effect run rather than a stale one
  // surviving termination and silently swallowing later postMessage calls.
  const [client, setClient] = useState<CsgWorkerClient | null>(null);
  const latestIdRef = useRef(0);
  const [state, setState] = useState<LiveGeometryState>({
    meshes: null,
    error: null,
    isGenerating: true,
  });

  useEffect(() => {
    const worker = new CsgWorkerClient();
    setClient(worker);
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (!client) return;
    const timeout = window.setTimeout(() => {
      setState((s) => ({ ...s, isGenerating: true }));
      const { id, result } = client.generate(project, 'live');
      latestIdRef.current = id;
      result
        .then((meshes) => {
          if (latestIdRef.current !== id) return;
          setState({ meshes, error: null, isGenerating: false });
        })
        .catch((err: Error) => {
          if (latestIdRef.current !== id) return;
          setState((s) => ({ ...s, error: err.message, isGenerating: false }));
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [client, project]);

  return { ...state, client };
}
