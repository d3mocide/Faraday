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
  const VALID_SHAPES = ['box', 'cylinder', 'hexagon', 'octagon', 'stadium', 'wedge'];
  if (typeof body.shape !== 'string' || !VALID_SHAPES.includes(body.shape)) return false;
  if (typeof body.wallThickness !== 'number') return false;

  if (typeof body.outer !== 'object' || body.outer === null) return false;
  const outer = body.outer as Record<string, unknown>;
  const hasCornerStyle = () => {
    if (typeof body.cornerStyle !== 'object' || body.cornerStyle === null) return false;
    return typeof (body.cornerStyle as Record<string, unknown>).type === 'string';
  };

  if (body.shape === 'box') {
    if (typeof outer.length !== 'number' || typeof outer.width !== 'number' || typeof outer.height !== 'number') {
      return false;
    }
    if (!hasCornerStyle()) return false;
    // panels is optional, but a malformed one would break the CSG's face lookup rather than just
    // rendering oddly -- so it's checked to the same depth as cornerStyle.
    if (body.panels !== undefined) {
      if (typeof body.panels !== 'object' || body.panels === null) return false;
      if (!Array.isArray((body.panels as Record<string, unknown>).faces)) return false;
    }
  } else if (body.shape === 'cylinder') {
    if (typeof outer.diameter !== 'number' || typeof outer.height !== 'number') return false;
  } else if (body.shape === 'hexagon' || body.shape === 'octagon') {
    if (typeof outer.radius !== 'number' || typeof outer.height !== 'number') return false;
  } else if (body.shape === 'stadium') {
    if (typeof outer.length !== 'number' || typeof outer.width !== 'number' || typeof outer.height !== 'number') {
      return false;
    }
    if (!hasCornerStyle()) return false;
  } else {
    // wedge
    if (
      typeof outer.length !== 'number' ||
      typeof outer.width !== 'number' ||
      typeof outer.heightFront !== 'number' ||
      typeof outer.heightBack !== 'number'
    ) {
      return false;
    }
    if (!hasCornerStyle()) return false;
  }

  if (typeof body.lid !== 'object' || body.lid === null) return false;
  if (typeof (body.lid as Record<string, unknown>).type !== 'string') return false;

  return true;
}
