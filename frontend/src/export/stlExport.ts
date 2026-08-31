import JSZip from 'jszip';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { CsgWorkerClient } from '../csg/CsgWorkerClient';
import { meshDataToBufferGeometry } from '../csg/meshToBufferGeometry';
import type { PartMesh } from '../csg/workerProtocol';
import type { EnclosureProject } from '../types/project';
import { generateBomCsv } from './bom';
import { sanitizeFilename } from './filename';
import { manufacturingProfileForProject } from '../state/manufacturingProfiles';
import { printRulesForProfile } from '../csg/printRules';
import { fastenerRecipeForScrew } from '../fasteners/library';

/** `case_base.stl`, `case_lid.stl`, `panel_left.stl`, ... -- one file per printed piece. */
function stlFilename(part: PartMesh): string {
  if (part.kind === 'panel' && part.face) return `panel_${part.face}.stl`;
  return `case_${part.kind}.stl`;
}

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
  for (const part of meshes.parts) {
    zip.file(stlFilename(part), partToStlBytes(part.mesh));
  }
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

/** Exports printer-dependent measurement artefacts separately from the enclosure, so production
 * STL downloads remain clean while every calibration run carries its exact profile assumptions. */
export async function exportCalibrationPackZip(
  client: CsgWorkerClient,
  project: EnclosureProject,
  onStatus?: (status: string) => void,
): Promise<void> {
  onStatus?.('Generating calibration coupons...');
  const { result } = client.generateCalibration(project);
  const { coupons } = await result;
  const profile = manufacturingProfileForProject(project);
  const rules = printRulesForProfile(profile);
  const screw = project.body.lid.screw ?? { size: 'M3', insertType: 'heat-set', count: 4 as const };
  const recipe = fastenerRecipeForScrew(screw);

  const zip = new JSZip();
  for (const coupon of coupons) zip.file(`calibration/${coupon.id}.stl`, partToStlBytes(coupon.mesh));
  zip.file(
    'calibration/README.txt',
    [
      `Faraday calibration pack for ${project.name}`,
      `Profile: ${profile.label} (${profile.calibrated ? 'calibrated' : 'uncalibrated'})`,
      `Nozzle: ${profile.nozzleDiameter}mm; line width: ${rules.lineWidth}mm; target skin: ${rules.minSkin}mm`,
      `Fastener: ${recipe.label}; insert bore: ${recipe.dimensions.heatSetHoleDiameter}mm; insert depth: ${recipe.dimensions.heatSetDepth}mm`,
      '',
      '1. Print every coupon using the intended material, nozzle, layer height, and slicer profile.',
      '2. Record the loosest acceptable fit-ladder pair, insert seating/retention, port clearance, and snap-beam behavior.',
      '3. Do not mark this profile calibrated until a representative enclosure also passes.',
    ].join('\n'),
  );
  onStatus?.('Packaging calibration pack...');
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(project.name)}-calibration.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
