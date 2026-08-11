import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { PanelFace } from '../types/project';
import type { PanelMetrics } from './parts';

export interface PanelBoxDims {
  length: number;
  width: number;
}

/** Axis-aligned box from two corners, in the same "min/max per axis" form the panel math produces. */
function boxBetween(
  wasm: ManifoldToplevel,
  x: [number, number],
  y: [number, number],
  z: [number, number],
): Manifold {
  const size: [number, number, number] = [x[1] - x[0], y[1] - y[0], z[1] - z[0]];
  return wasm.Manifold.cube(size, false).translate(x[0], y[0], z[0]);
}

function sorted(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

/** Which two faces sit at the ends of the given panel face, in (negative end, positive end) order. */
function neighbourFaces(face: PanelFace): [PanelFace, PanelFace] {
  return face === 'left' || face === 'right' ? ['front', 'back'] : ['left', 'right'];
}

interface PanelBounds {
  /** Through-wall axis: 'x' for left/right panels, 'y' for front/back. */
  axis: 'x' | 'y';
  /** Outer surface coordinate on that axis, and the sign pointing outward. */
  outer: number;
  sign: 1 | -1;
  /** Half extent of the in-plane (across) axis. */
  halfAcross: number;
  /** Across-axis bounds of the channel, negative end first. */
  channelAcross: [number, number];
}

/**
 * Where a panel's channel sits. The channel spans the full interior width plus `grooveDepth` into
 * each adjacent wall -- unless that adjacent wall is itself a panel, in which case there's no wall
 * to bite into and the channel simply stops short of the neighbouring channel instead.
 */
function panelBounds(dims: PanelBoxDims, metrics: PanelMetrics, face: PanelFace): PanelBounds {
  const acrossHalf = face === 'left' || face === 'right' ? dims.width / 2 : dims.length / 2;
  const outerHalf = face === 'left' || face === 'right' ? dims.length / 2 : dims.width / 2;
  const sign: 1 | -1 = face === 'right' || face === 'back' ? 1 : -1;
  const [negFace, posFace] = neighbourFaces(face);

  // Against a plain wall the channel bites `grooveDepth` into it. Against another panel there's no
  // wall to bite into, so it stops short of the neighbouring channel instead -- and far enough
  // short that the corner post left between the two plates is solid material rather than a sliver
  // of the body's rounded/chamfered corner.
  const endBound = (neighbour: PanelFace): number =>
    metrics.faces.includes(neighbour)
      ? acrossHalf - Math.max(metrics.thickness + metrics.clearance, metrics.cornerInset + 0.6)
      : acrossHalf - metrics.wallThickness + metrics.grooveDepth;

  return {
    axis: face === 'left' || face === 'right' ? 'x' : 'y',
    outer: sign * outerHalf,
    sign,
    halfAcross: acrossHalf,
    channelAcross: [-endBound(negFace), endBound(posFace)],
  };
}

const OVERCUT = 1; // mm the channel cut runs past the outer surface, into air

/**
 * The channel volume for one panel: subtracted from the base (over the plate's own height) and,
 * with lid capture on, from the lid's underside as a shallow pocket. Cutting this *after* the lid
 * mating geometry is what guarantees the plate always has a clear slot to slide down, even where a
 * screw boss or friction lip would otherwise intrude.
 */
export function panelChannelCut(
  wasm: ManifoldToplevel,
  dims: PanelBoxDims,
  metrics: PanelMetrics,
  face: PanelFace,
  z0: number,
  z1: number,
): Manifold {
  const b = panelBounds(dims, metrics, face);
  const through = sorted(
    b.outer + b.sign * OVERCUT,
    b.outer - b.sign * (metrics.thickness + metrics.clearance),
  );
  const across: [number, number] = b.channelAcross;
  return b.axis === 'x'
    ? boxBetween(wasm, through, across, [z0, z1])
    : boxBetween(wasm, across, through, [z0, z1]);
}

/**
 * The plate itself: flush with the case's outer surface, sized to the channel minus the fit
 * clearance. Trimmed against the outer shell so its ends follow the body's corner style instead of
 * poking out past a rounded or chamfered corner.
 */
export function panelPlate(
  wasm: ManifoldToplevel,
  dims: PanelBoxDims,
  metrics: PanelMetrics,
  face: PanelFace,
  outerShell: Manifold,
): Manifold {
  const b = panelBounds(dims, metrics, face);
  const through = sorted(b.outer, b.outer - b.sign * metrics.thickness);
  const half = metrics.clearance / 2;
  const across: [number, number] = [b.channelAcross[0] + half, b.channelAcross[1] - half];
  const z: [number, number] = [metrics.plateBottomZ, metrics.plateTopZ];
  const plate =
    b.axis === 'x'
      ? boxBetween(wasm, through, across, z)
      : boxBetween(wasm, across, through, z);
  return plate.intersect(outerShell);
}

/**
 * Lays a finished panel flat on the print bed, outer face down (best surface finish on the side
 * that shows, and no supports for any port cutout). Mirrors what orientLidForPrint does for the
 * lid: export-only, never applied to the live preview.
 */
export function orientPanelForPrint(panel: Manifold, face: PanelFace): Manifold {
  const rotated =
    face === 'right'
      ? panel.rotate(0, 90, 0)
      : face === 'left'
        ? panel.rotate(0, -90, 0)
        : face === 'front'
          ? panel.rotate(90, 0, 0)
          : panel.rotate(-90, 0, 0);
  const box = rotated.boundingBox();
  return rotated.translate(-box.min[0], -box.min[1], -box.min[2]);
}
