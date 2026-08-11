import type { EnclosureProject, PanelFace } from '../types/project';
import type { CsgQuality, PartKind } from './generateEnclosure';
import type { PartId } from './parts';

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

/** One printed piece as it crosses the worker boundary: the same identity generateEnclosure gave
 * it, plus its extracted mesh. */
export interface PartMesh {
  id: PartId;
  label: string;
  kind: PartKind;
  face?: PanelFace;
  mesh: MeshData;
}

export interface CsgRequest {
  id: number;
  project: EnclosureProject;
  quality: CsgQuality;
}

export type CsgResponse =
  | { id: number; type: 'result'; parts: PartMesh[] }
  | { id: number; type: 'error'; message: string };
