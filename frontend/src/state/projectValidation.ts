import type { EnclosureProject } from '../types/project';

/**
 * Minimal structural check on untrusted JSON (autosave restore, imported files) -- not a full
 * schema validator, just enough to avoid crashing the app on garbage or incompatible data.
 */
export function isValidEnclosureProject(data: unknown): data is EnclosureProject {
  if (typeof data !== 'object' || data === null) return false;
  const p = data as Record<string, unknown>;

  if (typeof p.id !== 'string' || typeof p.name !== 'string') return false;
  if (p.units !== 'mm' && p.units !== 'in') return false;
  if (typeof p.createdAt !== 'string' || typeof p.updatedAt !== 'string') return false;
  if (!Array.isArray(p.features)) return false;

  if (typeof p.body !== 'object' || p.body === null) return false;
  const body = p.body as Record<string, unknown>;
  if (body.shape !== 'box' && body.shape !== 'cylinder') return false;
  if (typeof body.wallThickness !== 'number') return false;

  if (typeof body.outer !== 'object' || body.outer === null) return false;
  const outer = body.outer as Record<string, unknown>;
  if (body.shape === 'box') {
    if (typeof outer.length !== 'number' || typeof outer.width !== 'number' || typeof outer.height !== 'number') {
      return false;
    }
    if (typeof body.cornerStyle !== 'object' || body.cornerStyle === null) return false;
    if (typeof (body.cornerStyle as Record<string, unknown>).type !== 'string') return false;
  } else {
    if (typeof outer.diameter !== 'number' || typeof outer.height !== 'number') return false;
  }

  if (typeof body.lid !== 'object' || body.lid === null) return false;
  if (typeof (body.lid as Record<string, unknown>).type !== 'string') return false;

  return true;
}
