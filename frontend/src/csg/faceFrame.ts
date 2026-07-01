import type { Face } from '../types/project';

export interface OuterDimensions {
  length: number; // X extent
  width: number; // Y extent
  height: number; // Z extent
}

export interface FaceFrame {
  /** Maps normalized (u,v) in [0,1] on this face to a world-space [x,y,z] point on the outer surface. */
  toWorld: (u: number, v: number) => [number, number, number];
  /** Outward unit normal of the face. */
  normal: [number, number, number];
}

/**
 * Face/axis convention (matches boxShell/generateEnclosure): length is X, width is Y, height is
 * Z. front/back split on Y, left/right split on X, top/bottom split on Z. For the four side
 * faces, u runs along the horizontal axis and v runs bottom (0) to top (1) along Z; for top/bottom,
 * u/v run along X/Y respectively. This is an internal convention, not specified in DESIGN.md.
 */
export function faceFrame(face: Face, outer: OuterDimensions): FaceFrame {
  const { length: l, width: w, height: h } = outer;
  switch (face) {
    case 'top':
      return { toWorld: (u, v) => [(u - 0.5) * l, (v - 0.5) * w, h], normal: [0, 0, 1] };
    case 'bottom':
      return { toWorld: (u, v) => [(u - 0.5) * l, (v - 0.5) * w, 0], normal: [0, 0, -1] };
    case 'front':
      return { toWorld: (u, v) => [(u - 0.5) * l, -w / 2, v * h], normal: [0, -1, 0] };
    case 'back':
      return { toWorld: (u, v) => [(u - 0.5) * l, w / 2, v * h], normal: [0, 1, 0] };
    case 'left':
      return { toWorld: (u, v) => [-l / 2, (u - 0.5) * w, v * h], normal: [-1, 0, 0] };
    case 'right':
      return { toWorld: (u, v) => [l / 2, (u - 0.5) * w, v * h], normal: [1, 0, 0] };
  }
}

/** Physical size [uExtent, vExtent] in mm of a face's two in-plane axes. */
export function faceSize(face: Face, outer: OuterDimensions): [number, number] {
  const { length: l, width: w, height: h } = outer;
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
  }
}

/** Inverse of faceFrame().toWorld — recovers normalized (u,v), not clamped to [0,1]. */
export function faceFromWorld(
  face: Face,
  outer: OuterDimensions,
  point: [number, number, number],
): [number, number] {
  const { length: l, width: w, height: h } = outer;
  const [x, y, z] = point;
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
  }
}

const CANONICAL_FACE_NORMALS: Array<[Face, [number, number, number]]> = [
  ['top', [0, 0, 1]],
  ['bottom', [0, 0, -1]],
  ['front', [0, -1, 0]],
  ['back', [0, 1, 0]],
  ['left', [-1, 0, 0]],
  ['right', [1, 0, 0]],
];

/** Finds which of the 6 canonical box faces a (possibly fillet-blended) normal most closely matches. */
export function closestFace(normal: [number, number, number]): Face {
  let best: Face = 'top';
  let bestDot = -Infinity;
  for (const [face, n] of CANONICAL_FACE_NORMALS) {
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
