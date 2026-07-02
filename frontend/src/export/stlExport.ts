import JSZip from 'jszip';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { CsgWorkerClient } from '../csg/CsgWorkerClient';
import { meshDataToBufferGeometry } from '../csg/meshToBufferGeometry';
import type { EnclosureProject } from '../types/project';
import { generateBomCsv } from './bom';
import { sanitizeFilename } from './filename';

function partToStlBytes(mesh: { positions: Float32Array; indices: Uint32Array }): Uint8Array {
  const geometry = meshDataToBufferGeometry(mesh);
  const object = new THREE.Mesh(geometry);
  const exporter = new STLExporter();
  const data = exporter.parse(object, { binary: true });
  geometry.dispose();
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

export async function exportEnclosureZip(
  client: CsgWorkerClient,
  project: EnclosureProject,
  onStatus?: (status: string) => void,
): Promise<void> {
  onStatus?.('Regenerating high-resolution geometry...');
  const { result } = client.generate(project, 'export');
  const meshes = await result;

  onStatus?.('Packaging STL files...');
  const zip = new JSZip();
  zip.file('case_base.stl', partToStlBytes(meshes.base));
  zip.file('case_lid.stl', partToStlBytes(meshes.lid));
  zip.file('bom.csv', generateBomCsv(project));
  const blob = await zip.generateAsync({ type: 'blob' });

  onStatus?.('Starting download...');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(project.name)}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
