import JSZip from 'jszip';
import type { CsgWorkerClient, EnclosureMeshes } from '../csg/CsgWorkerClient';
import type { PartMesh } from '../csg/workerProtocol';
import type { EnclosureProject } from '../types/project';
import { sanitizeFilename } from './filename';

function format(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(5)).toString() : '0';
}

/** Serializes the worker's already-resolved print meshes into the core 3MF model vocabulary. */
export function threeMfModelXml(parts: PartMesh[]): string {
  const objects = parts
    .map((part, index) => {
      const vertices: string[] = [];
      for (let offset = 0; offset < part.mesh.positions.length; offset += 3) {
        vertices.push(
          `<vertex x="${format(part.mesh.positions[offset])}" y="${format(part.mesh.positions[offset + 1])}" z="${format(part.mesh.positions[offset + 2])}"/>`,
        );
      }
      const triangles: string[] = [];
      for (let offset = 0; offset < part.mesh.indices.length; offset += 3) {
        triangles.push(
          `<triangle v1="${part.mesh.indices[offset]}" v2="${part.mesh.indices[offset + 1]}" v3="${part.mesh.indices[offset + 2]}"/>`,
        );
      }
      return `<object id="${index + 1}" type="model" name="${part.label}"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object>`;
    })
    .join('');
  const build = parts.map((_, index) => `<item objectid="${index + 1}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objects}</resources><build>${build}</build></model>`;
}

export async function threeMfBlob(meshes: EnclosureMeshes): Promise<Blob> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>');
  zip.file('3D/3dmodel.model', threeMfModelXml(meshes.parts));
  return zip.generateAsync({ type: 'blob' });
}

export async function exportEnclosure3mf(
  client: CsgWorkerClient,
  project: EnclosureProject,
  onStatus?: (status: string) => void,
): Promise<void> {
  onStatus?.('Regenerating high-resolution geometry...');
  const { result } = client.generate(project, 'export');
  const blob = await threeMfBlob(await result);
  onStatus?.('Starting 3MF download...');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(project.name)}.3mf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
