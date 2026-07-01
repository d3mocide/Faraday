import { isValidEnclosureProject } from '../state/projectValidation';
import type { EnclosureProject } from '../types/project';
import { sanitizeFilename } from './filename';

/** Downloads the project as a .json file -- the real backup/share mechanism (DESIGN.md §10); autosave is only a convenience cache. */
export function exportProjectJson(project: EnclosureProject): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(project.name)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function parseProjectJsonFile(file: File): Promise<EnclosureProject> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isValidEnclosureProject(parsed)) {
    throw new Error('That file is not a valid Faraday project.');
  }
  return parsed;
}
