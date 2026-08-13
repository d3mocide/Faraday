import type { EnclosureBody, Face, Feature } from '../types/project';

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
  | { shape: 'cylinder'; diameter: number; height: number }
  | { shape: 'hexagon'; radius: number; height: number }
  | { shape: 'octagon'; radius: number; height: number }
  | { shape: 'stadium'; length: number; width: number; height: number }
  | { shape: 'wedge'; length: number; width: number; heightFront: number; heightBack: number };

export function bodyGeometry(body: EnclosureBody): BodyGeometry {
  if (body.shape === 'box') {
    return { shape: 'box', length: body.outer.length, width: body.outer.width, height: body.outer.height };
  }
  if (body.shape === 'cylinder') {
    return { shape: 'cylinder', diameter: body.outer.diameter, height: body.outer.height };
  }
  if (body.shape === 'hexagon') {
    return { shape: 'hexagon', radius: body.outer.radius, height: body.outer.height };
  }
  if (body.shape === 'octagon') {
    return { shape: 'octagon', radius: body.outer.radius, height: body.outer.height };
  }
  if (body.shape === 'stadium') {
    return { shape: 'stadium', length: body.outer.length, width: body.outer.width, height: body.outer.height };
  }
  return { shape: 'wedge', length: body.outer.length, width: body.outer.width, heightFront: body.outer.heightFront, heightBack: body.outer.heightBack };
}

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
        return {
          toWorld: (u, v) => [(u - 0.5) * diameter, (v - 0.5) * diameter, height],
          normalAt: () => [0, 0, 1],
        };
    }
  }

  if (geom.shape === 'hexagon') {
    const { radius: r, height: h } = geom;
    const rFlat = r * Math.cos(Math.PI / 6);
    const faceW = r;
    if (face === 'top') {
      return { toWorld: (u, v) => [(u - 0.5) * 2 * r, (v - 0.5) * 2 * r, h], normalAt: () => [0, 0, 1] };
    }
    if (face === 'bottom') {
      return { toWorld: (u, v) => [(u - 0.5) * 2 * r, (v - 0.5) * 2 * r, 0], normalAt: () => [0, 0, -1] };
    }
    const idx = Math.max(0, ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].indexOf(face));
    const angle = (Math.PI / 3) * idx + Math.PI / 6;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const ux = -ny;
    const uy = nx;
    return {
      toWorld: (u, v) => [
        nx * rFlat + ux * (u - 0.5) * faceW,
        ny * rFlat + uy * (u - 0.5) * faceW,
        v * h,
      ],
      normalAt: () => [nx, ny, 0],
    };
  }

  if (geom.shape === 'octagon') {
    const { radius: r, height: h } = geom;
    const rFlat = r * Math.cos(Math.PI / 8);
    const faceW = 2 * r * Math.sin(Math.PI / 8);
    if (face === 'top') {
      return { toWorld: (u, v) => [(u - 0.5) * 2 * r, (v - 0.5) * 2 * r, h], normalAt: () => [0, 0, 1] };
    }
    if (face === 'bottom') {
      return { toWorld: (u, v) => [(u - 0.5) * 2 * r, (v - 0.5) * 2 * r, 0], normalAt: () => [0, 0, -1] };
    }
    const idx = Math.max(0, ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'].indexOf(face));
    const angle = (Math.PI / 4) * idx;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const ux = -ny;
    const uy = nx;
    return {
      toWorld: (u, v) => [
        nx * rFlat + ux * (u - 0.5) * faceW,
        ny * rFlat + uy * (u - 0.5) * faceW,
        v * h,
      ],
      normalAt: () => [nx, ny, 0],
    };
  }

  if (geom.shape === 'stadium' || geom.shape === 'wedge') {
    const l = geom.length;
    const w = geom.width;
    const h = geom.shape === 'wedge' ? geom.heightBack : geom.height;
    switch (face) {
      case 'slanted-top': {
        if (geom.shape === 'wedge') {
          const { heightFront: hF, heightBack: hB } = geom;
          const dy = w;
          const dz = hB - hF;
          const len = Math.hypot(dy, dz);
          return {
            toWorld: (u, v) => [(u - 0.5) * l, (v - 0.5) * w, hF + v * dz],
            normalAt: () => [0, -dz / len, dy / len],
          };
        }
        return { toWorld: (u, v) => [(u - 0.5) * l, (v - 0.5) * w, h], normalAt: () => [0, 0, 1] };
      }
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
      default:
        return { toWorld: (u, v) => [(u - 0.5) * l, (v - 0.5) * w, h], normalAt: () => [0, 0, 1] };
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
    default:
      return { toWorld: (u, v) => [(u - 0.5) * l, (v - 0.5) * w, h], normalAt: () => [0, 0, 1] };
  }
}

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
        return [diameter, diameter];
    }
  }

  if (geom.shape === 'hexagon') {
    const { radius: r, height: h } = geom;
    return face === 'top' || face === 'bottom' ? [2 * r, 2 * r] : [r, h];
  }

  if (geom.shape === 'octagon') {
    const { radius: r, height: h } = geom;
    const faceW = 2 * r * Math.sin(Math.PI / 8);
    return face === 'top' || face === 'bottom' ? [2 * r, 2 * r] : [faceW, h];
  }

  if (geom.shape === 'stadium' || geom.shape === 'wedge') {
    const l = geom.length;
    const w = geom.width;
    const h = geom.shape === 'wedge' ? geom.heightBack : geom.height;
    return face === 'top' || face === 'bottom' || face === 'slanted-top' ? [l, w] : face === 'front' || face === 'back' ? [l, h] : [w, h];
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
    default:
      return [l, w];
  }
}

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
        return [x / diameter + 0.5, y / diameter + 0.5];
    }
  }

  if (geom.shape === 'hexagon' || geom.shape === 'octagon') {
    const r = geom.radius;
    const h = geom.height;
    return face === 'top' || face === 'bottom' ? [x / (2 * r) + 0.5, y / (2 * r) + 0.5] : [0.5, z / h];
  }

  if (geom.shape === 'stadium' || geom.shape === 'wedge') {
    const l = geom.length;
    const w = geom.width;
    const h = geom.shape === 'wedge' ? geom.heightBack : geom.height;
    return face === 'top' || face === 'bottom' || face === 'slanted-top'
      ? [x / l + 0.5, y / w + 0.5]
      : face === 'front' || face === 'back'
      ? [x / l + 0.5, z / h]
      : [y / w + 0.5, z / h];
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
    default:
      return [x / l + 0.5, y / w + 0.5];
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

export function closestFace(normal: [number, number, number], shape: string): Face {
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

/** Which box corner a corner-anchored mount belongs to, and which way "out" points there. Returns
 * null whenever corner anchoring doesn't apply, which is the signal to fall back to face
 * placement: a cylinder has no vertical corners, and top/bottom aren't vertical faces. */
export function cornerAnchor(
  feature: Pick<Feature, 'face' | 'u' | 'v' | 'mount'>,
  geom: BodyGeometry,
): { x: number; y: number; z: number; angleDeg: number } | null {
  if (feature.mount?.anchor !== 'corner' || geom.shape !== 'box') return null;
  const { face, u, v } = feature;
  if (face === 'top' || face === 'bottom' || face === 'side') return null;

  // u picks which end of its own face the mount is nearest; the face itself fixes the other axis.
  const near = u < 0.5 ? -1 : 1;
  const sx = face === 'left' ? -1 : face === 'right' ? 1 : near;
  const sy = face === 'front' ? -1 : face === 'back' ? 1 : near;
  return {
    x: (sx * geom.length) / 2,
    y: (sy * geom.width) / 2,
    z: v * geom.height,
    angleDeg: (Math.atan2(sy, sx) * 180) / Math.PI,
  };
}

/**
 * World (x, y) of every pillar a support-pad feature produces: just its own position, or a row of
 * `count` pillars spaced `pitch` apart, centred on it. The row direction follows the pad's axis
 * turned by the feature's own rotation, so rotating a row rotates the whole arrangement rather
 * than skewing it. Shared by the CSG, the design checks and the viewport so all three agree on
 * where the pillars actually are.
 */
export function supportPadPositions(
  feature: Pick<Feature, 'u' | 'v' | 'rotationDeg' | 'pad'>,
  geom: BodyGeometry,
): Array<[number, number]> {
  const [cx, cy] = faceFrame('bottom', geom).toWorld(feature.u, feature.v);
  const spec = feature.pad;
  const count = Math.min(Math.max(Math.round(spec?.count ?? 1), 1), 64);
  const pitch = Math.max(spec?.pitch ?? 0, 0);
  if (count === 1 || pitch === 0) return [[cx, cy]];

  const theta = ((feature.rotationDeg ?? 0) * Math.PI) / 180;
  const [dx, dy] =
    spec?.axis === 'v'
      ? [-Math.sin(theta), Math.cos(theta)]
      : [Math.cos(theta), Math.sin(theta)];
  const first = -((count - 1) * pitch) / 2;
  const positions: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const along = first + i * pitch;
    positions.push([cx + dx * along, cy + dy * along]);
  }
  return positions;
}
