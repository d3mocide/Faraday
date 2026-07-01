import type { EnclosureProject } from '../types/project';
import { isValidEnclosureProject } from './projectValidation';

const AUTOSAVE_KEY = 'faraday:autosave';

/** Convenience cache only -- "Save Project" (a downloadable .json) is the real backup, per DESIGN.md §10. */
export function loadAutosavedProject(): EnclosureProject | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidEnclosureProject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveProjectToStorage(project: EnclosureProject): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
  } catch {
    // Storage full or unavailable (private browsing, etc.) -- autosave is a convenience, not
    // load-bearing, so fail silently rather than interrupt the user.
  }
}
