import type { EnclosureProject } from '../types/project';
import type { CsgQuality } from './generateEnclosure';

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface CsgRequest {
  id: number;
  project: EnclosureProject;
  quality: CsgQuality;
}

export type CsgResponse =
  | { id: number; type: 'result'; base: MeshData; lid: MeshData }
  | { id: number; type: 'error'; message: string };
