import type { CornerStyle } from '../types/project';

/**
 * The printability floor every generated feature is held to, in one place.
 *
 * Before this existed each clamp carried its own literal (0.8 here, `thickness - 0.8` there) and
 * none of them composed: a groove could leave 0.8mm of wall, a rounded corner could then take most
 * of that 0.8mm away, and nothing in the pipeline ever asked how much material was actually left.
 * That is what broke the first real print of the Waveshare panel grooves -- a nominally 1.0mm
 * retaining lip measured 0.40mm where the case's corner arc cut across it.
 *
 * The numbers are derived from one assumption -- a 0.4mm nozzle -- rather than chosen individually.
 * Note that they are deliberately *not* 1.0mm: an FDM wall wants to be a whole multiple of the
 * extrusion width, so a 1.0mm wall gets two perimeters plus a 0.2mm void the slicer cannot fill,
 * which is weaker than a deliberate 0.8mm wall. Three perimeters is the usual structural floor.
 */
export const NOZZLE = 0.4;

/** Material left between a cut and a free surface (wall skin, retaining lip, boss wall). */
export const MIN_SKIN = 3 * NOZZLE;

/** Material left between two cuts (the web between neighbouring port openings). */
export const MIN_WEB = 3 * NOZZLE;

/** A feature that stands free rather than being backed by the wall it grows from. */
export const MIN_RIB = 4 * NOZZLE;

/** The absolute floor: two perimeters, with no infill between them. Anything the generator is
 * forced below MIN_SKIN is still held above this, and a result that lands here is worth telling
 * the user about rather than quietly shipping. */
export const MIN_WALL = 2 * NOZZLE;

/**
 * How far the body's outer surface has moved inboard at `distance` mm along a wall from the
 * corner -- zero once you are past the corner treatment, and the full corner size at the corner
 * itself.
 *
 * This is what makes a slide-in panel's end grip conditional: the grip lives in the last
 * `wallThickness` of the adjacent wall, which on a body with any corner treatment is exactly where
 * the outer surface is busy turning. A 45-degree chamfer eats material fastest (linearly), a
 * rounded corner much more slowly (the arc's sagitta), which is why the same radius can be fine
 * rounded and impossible chamfered.
 */
export function cornerSurfaceInset(style: CornerStyle, distance: number): number {
  if (style.type === 'sharp') return 0;
  const size = Math.max(style.radius, 0);
  if (distance >= size || size <= 0) return 0;
  const d = Math.max(distance, 0);
  if (style.type === 'rounded') return size - Math.sqrt(Math.max(size * size - (size - d) * (size - d), 0));
  // chamfered, faceted and double-chamfer all cut the corner off with flats; the single 45-degree
  // chamfer is the most aggressive of them, so it is the safe one to size against.
  return size - d;
}
