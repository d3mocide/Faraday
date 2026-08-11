export type Face = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'side';

export type Units = 'mm' | 'in';

export type CornerStyleType = 'sharp' | 'rounded' | 'chamfered';

export interface CornerStyle {
  type: CornerStyleType;
  radius: number; // mm, ignored if 'sharp'
}

export type ScrewSize = 'M2' | 'M2.5' | 'M3' | 'M4';
export type ScrewInsertType = 'heat-set' | 'self-tap';
export type ScrewCount = 4 | 6 | 8;

/** Column cross-section. A square column is stiffer for the same footprint and gives a flat face
 * to blend into a wall; a round one wastes less interior space. */
export type ScrewColumnShape = 'round' | 'square';

/** 'flush' leaves the screw head proud of the lid. 'counterbore' sinks it into a pocket so the
 * head sits below the surface -- concealed, and pluggable with a printed cap if you want the lid
 * to read as unbroken. */
export type ScrewHeadStyle = 'flush' | 'counterbore';

/** Where the lid's screw columns stand. 'interior' bosses rise inside the cavity (the default, and
 * the right call whenever there's floor space to spare); 'exterior' columns straddle the outside of
 * the front and back walls instead, which is the only option once the board fills the interior. */
export type ScrewPlacement = 'interior' | 'exterior';

export interface ScrewSpec {
  size: ScrewSize;
  insertType: ScrewInsertType;
  count: ScrewCount;
  placement?: ScrewPlacement; // undefined = 'interior'
  shape?: ScrewColumnShape; // undefined = 'round'
  headStyle?: ScrewHeadStyle; // undefined = 'flush'
  /** How tall the base's column is, in mm. Undefined = the full distance from the floor to the lid
   * seam (the original behaviour). A shorter column hangs from the seam instead of standing on the
   * floor, which keeps the interior clear underneath -- room for a board, a battery, or cable
   * routing to pass beneath it. Hanging columns are pushed into the wall far enough to weld to it,
   * since they no longer have the floor holding them up. */
  columnHeight?: number;
  /** mm from the interior cavity wall to each boss center. Undefined = the CSG default
   * (bossRadius + 1mm, just enough to keep the boss inside the wall) -- see bossPositions in
   * csg/primitives.ts. Lower values pull bosses toward the case's outer edge, which is also the
   * lever for keeping them clear of a board-mount sitting in the middle of the cavity. */
  edgeInset?: number;
}

export type LidType = 'friction-lip' | 'screw-boss' | 'snap-fit';

/** Phase 5 stretch feature (DESIGN.md §13): an O-ring/cord seal channel cut into the base's top
 * rim, independent of lid.type -- any lid type can be combined with a gasket channel. */
export interface GasketSpec {
  width: number; // mm, channel width
  depth: number; // mm, channel depth
}

export interface LidSpec {
  type: LidType;
  splitHeight: number; // mm from base where the lid separates
  wallGap: number; // mm clearance for the fit (tune per printer)
  screw?: ScrewSpec; // only for 'screw-boss'
  gasket?: GasketSpec; // present = channel cut, absent = no gasket channel
}

export type BodyShape = 'box' | 'cylinder';

/** The four box walls that can be swapped for a separately-printed slide-in panel. */
export type PanelFace = 'front' | 'back' | 'left' | 'right';

/**
 * Slide-in end panels: the listed walls are removed from the base and printed as separate flat
 * plates that drop into a channel formed by grooves cut into the two adjacent walls and the floor
 * (and optionally the lid's underside). This is what makes a multi-part enclosure -- a connector
 * panel can be reprinted on its own when the port layout changes, and every port cutout on that
 * face is cut into the plate instead of the base. Box bodies only: a cylinder has no flat wall to
 * replace.
 */
export interface PanelSpec {
  faces: PanelFace[];
  thickness: number; // mm, plate thickness
  fitClearance: number; // mm of total slop in the channel (half of it per side)
  grooveDepth: number; // mm the channel bites into the adjacent walls and the floor
  captureInLid: boolean; // lid gets a matching groove over the plate's top edge
}

export interface BoxBody {
  shape: 'box';
  outer: { length: number; width: number; height: number }; // mm
  wallThickness: number; // mm
  cornerStyle: CornerStyle;
  lid: LidSpec;
  panels?: PanelSpec; // absent = every wall is part of the base, the original single-piece body
}

/** Phase 5 stretch shape (DESIGN.md §9/§13): a round mast/antenna-mount enclosure. No corner
 * style (nothing to round/chamfer on a circular footprint) and its curved lateral wall is the
 * 'side' face -- see Face and csg/faceFrame.ts's cylinder branch for the u/v convention. */
export interface CylinderBody {
  shape: 'cylinder';
  outer: { diameter: number; height: number }; // mm
  wallThickness: number; // mm
  lid: LidSpec;
}

export type EnclosureBody = BoxBody | CylinderBody;

export interface StandoffSpec {
  outerDiameter: number; // mm
  screwHoleDiameter: number; // mm
  height: number; // mm
}

export interface VentSpec {
  pattern: 'slots' | 'honeycomb';
  areaWidth: number;
  areaHeight: number;
  slotWidth: number;
  slotSpacing: number;
}

/** A PCB footprint mounted on the interior floor: an outline (rendered as a ghost board in the
 * viewport, never exported) plus a mounting-hole pattern that generates one standoff per hole.
 * Hole offsets are mm from the board's center, x along the floor's u axis, y along v. */
export interface BoardMountSpec {
  boardWidth: number; // mm, along the floor's u axis
  boardDepth: number; // mm, along the floor's v axis
  boardThickness: number; // mm, ghost render only
  holes: Array<{ x: number; y: number }>; // mm offsets from board center
  standoff: StandoffSpec; // shared by every hole
}

/** 'flange' is a flat ear standing out from a face (wall-mount tab); 'boss' is a cylindrical post
 * along the face's outward normal (external standoff / foot / spacer column). */
export type ExternalMountStyle = 'flange' | 'boss';

/** Hole through an external mount. 'slot' and 'keyhole' both run along the outward direction --
 * a slot for screw-position adjustment, a keyhole so the case can be dropped over a screw head
 * and slid to trap it. */
export type ExternalMountHoleStyle = 'none' | 'round' | 'slot' | 'keyhole';

/**
 * A feature that grows *outward* from a face instead of cutting into it -- the outside counterpart
 * to the interior-only `standoff`. Unions into whichever printed part owns that patch of the face
 * (base, lid, or a slide-in panel).
 */
/** 'face' centres the mount on the face at its (u, v). 'corner' snaps it to whichever vertical
 * corner of a box that face's u is nearest and aims it out along the diagonal, so it welds into
 * both walls at once -- the four-ears-at-the-corners pattern most wall-mounted project boxes use.
 * Ignored (falls back to 'face') on a cylinder and on the top/bottom faces, which have no vertical
 * corner to anchor to. */
export type ExternalMountAnchor = 'face' | 'corner';

export interface ExternalMountSpec {
  style: ExternalMountStyle;
  anchor?: ExternalMountAnchor; // undefined = 'face'
  /** flange: length along the face's u axis. boss: outer diameter. */
  width: number; // mm
  /** How far it stands proud of the face. */
  protrusion: number; // mm
  /** flange: plate thickness (along the face's v axis). Ignored for a boss. */
  thickness: number; // mm
  hole: ExternalMountHoleStyle;
  holeDiameter: number; // mm
  /** 'slot': total travel of the slot. 'keyhole': center distance between the big and small ends. */
  slotLength: number; // mm
  /** boss only: blind hole depth measured from the boss's outer end. Undefined = drilled through. */
  holeDepth?: number; // mm
}

/** How the air actually gets through a fan opening. 'concentric' is the classic ring grille (open
 * rings held together by radial spokes); 'honeycomb' reuses the vent hex pattern; 'open' is a
 * single round hole for a fan with its own finger guard. */
export type FanGrilleStyle = 'concentric' | 'honeycomb' | 'open';

/**
 * A fan opening: grille + the four screw holes on the fan's own bolt circle, and optionally raised
 * bosses on the inside face to screw the fan into. Sizes and hole pitches come from FAN_PRESETS
 * (csg/fanLibrary.ts).
 */
export interface FanMountSpec {
  /** Nominal fan size in mm -- the fan's square footprint (40 = a 40x40mm fan). */
  size: number;
  /** Screw hole spacing, center to center. */
  holePitch: number;
  screwHoleDiameter: number;
  grille: FanGrilleStyle;
  /** concentric: width of each open ring and the material bridge left between rings. */
  ringWidth: number;
  ringGap: number;
  spokeCount: number;
  spokeWidth: number;
  /** Diameter of the plain hole at the middle of a concentric grille. 0 = no central hole. */
  hubDiameter: number;
  /** Raised pads on the inside face, so the fan screws pull against a boss rather than the bare
   * wall. 0 = flat. */
  bossHeight: number;
}

export type FeatureType =
  | 'connector-cutout'
  | 'standoff'
  | 'vent'
  | 'custom-hole'
  | 'board-mount'
  | 'external-mount'
  | 'fan-mount';

/** Per-placement size override for a connector cutout. Fields fall back to the library entry,
 * so overriding one dimension doesn't freeze the others. */
export interface ConnectorSizeOverride {
  diameter?: number; // mm
  width?: number; // mm
  height?: number; // mm (for 'dshape': the across-flat dimension)
}

export interface Feature {
  id: string;
  type: FeatureType;
  face: Face;
  u: number; // 0-1 normalized position across the face
  v: number; // 0-1 normalized position across the face
  rotationDeg: number; // rotation about the face normal
  connectorId?: string; // ref into ConnectorLibraryEntry, for 'connector-cutout'
  connectorOverride?: ConnectorSizeOverride; // for 'connector-cutout'
  standoff?: StandoffSpec;
  vent?: VentSpec;
  custom?: { shape: 'circle' | 'rect'; width: number; height?: number };
  board?: BoardMountSpec; // for 'board-mount'
  mount?: ExternalMountSpec; // for 'external-mount'
  fan?: FanMountSpec; // for 'fan-mount'
  hidden?: boolean; // when true, feature is hidden from CSG generation and 3D preview
  locked?: boolean; // when true, feature is locked against 3D drag gestures
}

export type ConnectorCategory =
  | 'rf'
  | 'usb'
  | 'power'
  | 'antenna'
  | 'video'
  | 'network'
  | 'audio'
  | 'misc';

export interface ConnectorLibraryEntry {
  id: string;
  label: string;
  category: ConnectorCategory;
  holeShape: 'circle' | 'rect' | 'dshape';
  diameter?: number;
  width?: number;
  height?: number;
  cornerRadius?: number;
  notes?: string;
}

export interface EnclosureProject {
  id: string;
  name: string;
  units: Units; // display preference only, geometry is always canonical mm
  createdAt: string;
  updatedAt: string;
  body: EnclosureBody;
  features: Feature[];
}
