import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { PanelFace } from '../types/project';
import type { PanelMetrics } from './parts';

export interface PanelBoxDims {
  length: number;
  width: number;
}

/**
 * Copies of the body's outer shell, shrunk inward by a fixed amount, used to keep the channel and
 * the plate's rebate a *constant* distance from the outer surface wherever they run.
 *
 * This is the whole fix for the broken grooves. A slot cut to a constant coordinate leaves a
 * constant amount of material only against a flat wall: where the wall turns a rounded or
 * chamfered corner the outer surface has already moved inboard, so the retaining lip tapers into
 * the arc -- on the Waveshare preset a nominally 1.0mm lip measured 0.40mm at its outer edge, and
 * broke. Clipping the cut against a shrunk copy of the shell instead means the lip is its nominal
 * thickness everywhere, corner or not.
 */
export interface PanelShells {
  /** Outer shell shrunk by `retainLip` -- the channel's end slots may not cross this. */
  lip: Manifold;
  /** Outer shell shrunk by `retainLip + clearance/2` -- the plate's rebated ends stop here. */
  rebate: Manifold;
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

/** One end of a panel: where its channel stops, and whether there's a wall there to grip it. */
interface PanelEnd {
  sign: 1 | -1;
  /** Across-axis coordinate the channel reaches (signed). */
  bound: number;
  /** Across-axis coordinate of the adjacent wall's inner face -- where its grip starts (signed). */
  cavityEdge: number;
  /** False when the neighbouring face is itself a panel: no wall there, so nothing to grip with. */
  hasWall: boolean;
}

interface PanelBounds {
  /** Through-wall axis: 'x' for left/right panels, 'y' for front/back. */
  axis: 'x' | 'y';
  /** Outer surface coordinate on that axis, and the sign pointing outward. */
  outer: number;
  sign: 1 | -1;
  ends: [PanelEnd, PanelEnd];
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
  const end = (neighbour: PanelFace, endSign: 1 | -1): PanelEnd => {
    const hasWall = !metrics.faces.includes(neighbour);
    const bound = hasWall
      ? acrossHalf - metrics.wallThickness + metrics.grooveDepth
      : acrossHalf - Math.max(metrics.thickness + metrics.clearance, metrics.cornerInset + 0.6);
    return {
      sign: endSign,
      bound: endSign * bound,
      cavityEdge: endSign * (acrossHalf - metrics.wallThickness),
      hasWall,
    };
  };

  return {
    axis: face === 'left' || face === 'right' ? 'x' : 'y',
    outer: sign * outerHalf,
    sign,
    ends: [end(negFace, -1), end(posFace, 1)],
  };
}

const OVERCUT = 1; // mm the channel cut runs past the outer surface, into air

/**
 * The channel volume for one panel: subtracted from the base (over the plate's own height) and,
 * with lid capture on, from the lid's underside as a shallow pocket. Cutting this *after* the lid
 * mating geometry is what guarantees the plate always has a clear slot to slide down, even where a
 * screw boss or friction lip would otherwise intrude.
 *
 * It's two shapes, not one. Across the cavity the wall is removed outright, so the plate shows and
 * its port cutouts open to the outside. At the ends, where the adjacent walls are, the cut stops
 * `retainLip` short of the outer surface -- that leftover sliver of wall is what the plate's
 * rebated ends slide down behind, and the only thing stopping the plate falling straight back out.
 * `withLip` is false for the lid's capture pocket, which has no business growing a fragile tab.
 */
export function panelChannelCut(
  wasm: ManifoldToplevel,
  dims: PanelBoxDims,
  metrics: PanelMetrics,
  face: PanelFace,
  z0: number,
  z1: number,
  withLip = true,
  shells?: PanelShells,
): Manifold {
  const b = panelBounds(dims, metrics, face);
  const inner = b.outer - b.sign * (metrics.thickness + metrics.clearance);
  const fullDepth = sorted(b.outer + b.sign * OVERCUT, inner);
  const lip = withLip ? metrics.retainLip : 0;
  const slotDepth = sorted(b.outer - b.sign * lip, inner);

  const box = (through: [number, number], across: [number, number]) =>
    b.axis === 'x'
      ? boxBetween(wasm, through, across, [z0, z1])
      : boxBetween(wasm, across, through, [z0, z1]);

  // The window spans wall to wall; each lipped end then reaches on into its wall's groove.
  const windowAcross = sorted(
    b.ends[0].hasWall && lip > 0 ? b.ends[0].cavityEdge : b.ends[0].bound,
    b.ends[1].hasWall && lip > 0 ? b.ends[1].cavityEdge : b.ends[1].bound,
  );
  let cut = box(fullDepth, windowAcross);
  if (lip <= 0) return cut;

  for (const end of b.ends) {
    if (!end.hasWall) continue;
    const across = sorted(end.cavityEdge, end.bound);
    // Clipped against the shrunk shell the slot follows the corner, so the lip left standing
    // outboard of it is `retainLip` thick along its whole length. Without a shell to clip against
    // it falls back to a constant-depth slot, which is only equivalent on a sharp-cornered body.
    cut = cut.add(
      shells ? box(fullDepth, across).intersect(shells.lip) : box(slotDepth, across),
    );
  }
  return cut;
}

/**
 * The plate itself: flush with the case's outer surface, sized to the channel minus the fit
 * clearance, with its ends rebated by `retainLip` so they tuck in behind the wall lips the channel
 * cut left standing. Trimmed against the outer shell so its ends follow the body's corner style
 * instead of poking out past a rounded or chamfered corner.
 */
export function panelPlate(
  wasm: ManifoldToplevel,
  dims: PanelBoxDims,
  metrics: PanelMetrics,
  face: PanelFace,
  outerShell: Manifold,
  shells?: PanelShells,
): Manifold {
  const b = panelBounds(dims, metrics, face);
  const half = metrics.clearance / 2;
  const z: [number, number] = [metrics.plateBottomZ, metrics.plateTopZ];

  const box = (through: [number, number], across: [number, number]) =>
    b.axis === 'x'
      ? boxBetween(wasm, through, across, z)
      : boxBetween(wasm, across, through, z);

  const across: [number, number] = sorted(b.ends[0].bound + half, b.ends[1].bound - half);
  let plate = box(sorted(b.outer, b.outer - b.sign * metrics.thickness), across);

  // Rebate each gripped end: shave `retainLip` (plus half the fit clearance, so it still slides)
  // off the outer face over the band the wall's lip covers. The step starts a whisker inboard of
  // the wall so the full-thickness part of the plate can never foul the lip.
  if (metrics.retainLip > 0) {
    const rebateDepth = sorted(
      b.outer + b.sign * OVERCUT,
      b.outer - b.sign * (metrics.retainLip + half),
    );
    const fullDepth = sorted(b.outer + b.sign * OVERCUT, b.outer - b.sign * (metrics.thickness + 1));
    for (const end of b.ends) {
      if (!end.hasWall) continue;
      const rebateAcross = sorted(
        end.cavityEdge - end.sign * 0.2,
        end.bound + end.sign * OVERCUT,
      );
      // Mirrors the channel's own clipping: everything in the end band that sits outboard of the
      // shrunk shell goes, so the ear follows the corner exactly like the lip it slides behind.
      plate = plate.subtract(
        shells
          ? box(fullDepth, rebateAcross).subtract(shells.rebate)
          : box(rebateDepth, rebateAcross),
      );
    }
  }

  return plate.intersect(outerShell);
}

/** A cylinder lying along a horizontal axis, given as two coordinates on that axis. */
function axialCylinder(
  wasm: ManifoldToplevel,
  axis: 'x' | 'y',
  diameter: number,
  from: number,
  to: number,
  across: number,
  z: number,
): Manifold {
  const cyl = wasm.Manifold.cylinder(Math.abs(to - from), diameter / 2, diameter / 2, 0, false);
  const start = Math.min(from, to);
  return axis === 'x'
    ? cyl.rotate(0, 90, 0).translate(start, across, z)
    : cyl.rotate(-90, 0, 0).translate(across, start, z);
}

/** Where each screw through a plate's ends sits: one across-axis coordinate per end, one Z per
 * screw on that end. */
function screwSites(b: PanelBounds, metrics: PanelMetrics): Array<{ across: number; z: number }> {
  const screw = metrics.screw!;
  const sites: Array<{ across: number; z: number }> = [];
  for (const end of b.ends) {
    const across = end.cavityEdge - end.sign * screw.centerInset;
    for (const z of screw.zPositions) sites.push({ across, z });
  }
  return sites;
}

/**
 * The posts a screwed plate threads into: a vertical column in the interior corner at each end of
 * the opening, standing on the floor and welded to the adjacent wall down its whole height -- which
 * is what makes a horizontal screw hole printable here at all, since the column itself has no
 * overhang. Unioned into the base *after* the channel is cut, so the channel can't take a bite out
 * of it.
 */
export function panelPosts(
  wasm: ManifoldToplevel,
  dims: PanelBoxDims,
  metrics: PanelMetrics,
  face: PanelFace,
): Manifold | null {
  const screw = metrics.screw;
  if (!screw) return null;
  const b = panelBounds(dims, metrics, face);
  // Front face sits half the fit clearance behind the plate, so the plate still slides freely past
  // it and the screw closes that gap rather than the post fighting the channel for the space.
  const front = b.outer - b.sign * (metrics.thickness + metrics.clearance / 2);
  const through = sorted(front, front - b.sign * screw.postDepth);
  const z: [number, number] = [0, metrics.splitHeight];

  let posts: Manifold | null = null;
  for (const end of b.ends) {
    const across = sorted(end.cavityEdge, end.cavityEdge - end.sign * screw.postWidth);
    const post =
      b.axis === 'x'
        ? boxBetween(wasm, through, across, z)
        : boxBetween(wasm, across, through, z);
    posts = posts ? posts.add(post) : post;
  }
  return posts;
}

/** Pilot holes (or heat-set sockets) bored into the posts, along the panel's own normal. */
export function panelPostBores(
  wasm: ManifoldToplevel,
  dims: PanelBoxDims,
  metrics: PanelMetrics,
  face: PanelFace,
): Manifold | null {
  const screw = metrics.screw;
  if (!screw) return null;
  const b = panelBounds(dims, metrics, face);
  // Starts inside the plate's own slot so the bore always breaks through the post's front face
  // cleanly, and runs its full depth into the post.
  const mouth = b.outer - b.sign * metrics.thickness;
  const tip = b.outer - b.sign * (metrics.thickness + metrics.clearance / 2 + screw.boreDepth);

  let bores: Manifold | null = null;
  for (const site of screwSites(b, metrics)) {
    const bore = axialCylinder(wasm, b.axis, screw.boreDiameter, mouth, tip, site.across, site.z);
    bores = bores ? bores.add(bore) : bore;
  }
  return bores;
}

/** Clearance holes through the plate, with the head's counterbore where one was asked for. */
export function panelPlateScrewHoles(
  wasm: ManifoldToplevel,
  dims: PanelBoxDims,
  metrics: PanelMetrics,
  face: PanelFace,
): Manifold | null {
  const screw = metrics.screw;
  if (!screw) return null;
  const b = panelBounds(dims, metrics, face);
  const outside = b.outer + b.sign * OVERCUT;
  const inside = b.outer - b.sign * (metrics.thickness + OVERCUT);

  let holes: Manifold | null = null;
  for (const site of screwSites(b, metrics)) {
    let hole = axialCylinder(
      wasm,
      b.axis,
      screw.clearanceDiameter,
      outside,
      inside,
      site.across,
      site.z,
    );
    if (screw.counterboreDepth > 0) {
      hole = hole.add(
        axialCylinder(
          wasm,
          b.axis,
          screw.headDiameter + 0.4,
          outside,
          b.outer - b.sign * screw.counterboreDepth,
          site.across,
          site.z,
        ),
      );
    }
    holes = holes ? holes.add(hole) : hole;
  }
  return holes;
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
