import { useEffect } from 'react';
import type { EnclosureProject } from '../types/project';
import { saveProjectToStorage } from './autosave';

const DEBOUNCE_MS = 400;

/** Debounced write of the current project to localStorage on every change. */
export function useAutosave(project: EnclosureProject): void {
  useEffect(() => {
    const timeout = window.setTimeout(() => saveProjectToStorage(project), DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [project]);
}
