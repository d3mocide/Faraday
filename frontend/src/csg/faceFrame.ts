import type { EnclosureBody, Face } from '../types/project';

export interface FaceFrame {
  /** Maps normalized (u,v) in [0,1] on this face to a world-space [x,y,z] point on the outer surface. */
  toWorld: (u: number, v: number) => [number, number, number];
  /** Outward unit normal of the face at (u,v). Constant for box faces; varies with u (angle) for a cylinder's 'side' face. */
  normalAt: (u: number, v: number) => [number, number, number];
}

/**
 * Shape + outer dimensions, everything faceFrame/faceSize/faceFromWorld/closestFace need --
 * deliberately doesn't carry wallThickness/lid/cornerStyle, which are irrelevant to face geometry.
 */
export type BodyGeometry =
  | { shape: 'box'; length: number; width: number; height: number }
  | { shape: 'cylinder'; diameter: number; height: number };

export function bodyGeometry(body: EnclosureBody): BodyGeometry {
  return body.shape === 'box'
    ? { shape: 'box', length: body.outer.length, width: body.outer.width, height: body.outer.height }
    : { shape: 'cylinder', diameter: body.outer.diameter, height: body.outer.height };
}

/**
 * Face/axis convention (matches boxShell/generateEnclosure): length is X, width is Y, height is
 * Z. front/back split on Y, left/right split on X, top/bottom split on Z. For the four side
 * faces, u runs along the horizontal axis and v runs bottom (0) to top (1) along Z; for top/bottom,
 * u/v run along X/Y respectively. This is an internal convention, not specified in DESIGN.md.
 *
 * For a cylinder body, 'top'/'bottom' are the circular caps (u/v map onto a diameter x diameter
 * square the same way a box's top/bottom do -- some (u,v) near the corners fall outside the
 * physical disc, same "placement isn't fenced to the solid material" latitude a box already has
 * near its own footprint). 'side' is the curved lateral wall: u is the angle around Z (0 -> 0deg,
 * 1 -> 360deg, wrapping), v is 0 (bottom) to 1 (top) along Z, matching the box side faces' v
 * convention.
 */
export function faceFrame(face: Face, geom: BodyGeometry): FaceFrame {
  if (geom.shape === 'cylinder') {
    const { diameter, height } = geom;
    const r = diameter / 2;
    switch (face) {
      case 'top':
        return {
          toWorld: (u, v) => [(u - 0.5) * diameter, (v - 0.5) * diameter, height],
          normalAt: () => [0, 0, 1],
        };
      case 'bottom':
        return {
          toWorld: (u, v) => [(u - 0.5) * diameter, (v - 0.5) * diameter, 0],
          normalAt: () => [0, 0, -1],
        };
      case 'side':
        return {
          toWorld: (u, v) => {
            const theta = u * 2 * Math.PI;
            return [r * Math.cos(theta), r * Math.sin(theta), v * height];
          },
          normalAt: (u) => {
            const theta = u * 2 * Math.PI;
            return [Math.cos(theta), Math.sin(theta), 0];
          },
        };
      default:
        throw new Error(`face '${face}' does not exist on a cylinder body`);
    }
  }

  const { length: l, width: w, height: h } = geom;
  switch (face) {
    case 'top':
      return { toWorld: (u, v) => [(u - 0.5) * l, (v - 0.5) * w, h], normalAt: () => [0, 0, 1] };
    case 'bottom':
      return { toWorld: (u, v) => [(u - 0.5) * l, (v - 0.5) * w, 0], normalAt: () => [0, 0, -1] };
    case 'front':
      return { toWorld: (u, v) => [(u - 0.5) * l, -w / 2, v * h], normalAt: () => [0, -1, 0] };
    case 'back':
      return { toWorld: (u, v) => [(u - 0.5) * l, w / 2, v * h], normalAt: () => [0, 1, 0] };
    case 'left':
      return { toWorld: (u, v) => [-l / 2, (u - 0.5) * w, v * h], normalAt: () => [-1, 0, 0] };
    case 'right':
      return { toWorld: (u, v) => [l / 2, (u - 0.5) * w, v * h], normalAt: () => [1, 0, 0] };
    case 'side':
      throw new Error("face 'side' does not exist on a box body");
  }
}

/** Physical size [uExtent, vExtent] in mm of a face's two in-plane axes. For a cylinder's 'side'
 * face, uExtent is the circumference (u wraps, not a flat extent, but this is still the right
 * denominator for converting an mm snapping/drag threshold to a fraction of u). */
export function faceSize(face: Face, geom: BodyGeometry): [number, number] {
  if (geom.shape === 'cylinder') {
    const { diameter, height } = geom;
    switch (face) {
      case 'top':
      case 'bottom':
        return [diameter, diameter];
      case 'side':
        return [Math.PI * diameter, height];
      default:
        throw new Error(`face '${face}' does not exist on a cylinder body`);
    }
  }

  const { length: l, width: w, height: h } = geom;
  switch (face) {
    case 'top':
    case 'bottom':
      return [l, w];
    case 'front':
    case 'back':
      return [l, h];
    case 'left':
    case 'right':
      return [w, h];
    case 'side':
      throw new Error("face 'side' does not exist on a box body");
  }
}

/** Inverse of faceFrame().toWorld — recovers normalized (u,v), not clamped to [0,1] (u wraps for a cylinder's 'side' face). */
export function faceFromWorld(
  face: Face,
  geom: BodyGeometry,
  point: [number, number, number],
): [number, number] {
  const [x, y, z] = point;

  if (geom.shape === 'cylinder') {
    const { diameter, height } = geom;
    switch (face) {
      case 'top':
      case 'bottom':
        return [x / diameter + 0.5, y / diameter + 0.5];
      case 'side': {
        const theta = Math.atan2(y, x);
        const u = (theta / (2 * Math.PI) + 1) % 1;
        return [u, z / height];
      }
      default:
        throw new Error(`face '${face}' does not exist on a cylinder body`);
    }
  }

  const { length: l, width: w, height: h } = geom;
  switch (face) {
    case 'top':
    case 'bottom':
      return [x / l + 0.5, y / w + 0.5];
    case 'front':
    case 'back':
      return [x / l + 0.5, z / h];
    case 'left':
    case 'right':
      return [y / w + 0.5, z / h];
    case 'side':
      throw new Error("face 'side' does not exist on a box body");
  }
}

const CANONICAL_BOX_FACE_NORMALS: Array<[Face, [number, number, number]]> = [
  ['top', [0, 0, 1]],
  ['bottom', [0, 0, -1]],
  ['front', [0, -1, 0]],
  ['back', [0, 1, 0]],
  ['left', [-1, 0, 0]],
  ['right', [1, 0, 0]],
];

/** Finds which face of the body a (possibly fillet-blended, or continuously-varying for a
 * cylinder) surface normal most closely matches. */
export function closestFace(normal: [number, number, number], shape: 'box' | 'cylinder'): Face {
  if (shape === 'cylinder') {
    const [nx, ny, nz] = normal;
    const radial = Math.hypot(nx, ny);
    if (Math.abs(nz) > radial) return nz > 0 ? 'top' : 'bottom';
    return 'side';
  }

  let best: Face = 'top';
  let bestDot = -Infinity;
  for (const [face, n] of CANONICAL_BOX_FACE_NORMALS) {
    const dot = normal[0] * n[0] + normal[1] * n[1] + normal[2] * n[2];
    if (dot > bestDot) {
      bestDot = dot;
      best = face;
    }
  }
  return best;
}

export function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
