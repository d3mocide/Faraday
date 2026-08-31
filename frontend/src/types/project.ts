export type PolygonFaceHex = 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6';
export type PolygonFaceOct = 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8';

export type Face =
  | 'top'
  | 'bottom'
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'side'
  | 'f1'
  | 'f2'
  | 'f3'
  | 'f4'
  | 'f5'
  | 'f6'
  | 'f7'
  | 'f8'
  | 'slanted-top';

export type Units = 'mm' | 'in';

export type CornerStyleType = 'sharp' | 'rounded' | 'chamfered' | 'faceted' | 'double-chamfer';

export interface CornerStyle {
  type: CornerStyleType;
  radius: number; // mm, ignored if 'sharp'
}

export type EdgeBevelType = 'none' | 'chamfer';

export interface EdgeBevelSpec {
  type: EdgeBevelType;
  size: number; // mm depth/width of the 45-degree rim chamfer
}

export interface TessellationSpec {
  liveSegments: number; // e.g. 16..128, default 32
  exportSegments: number; // e.g. 32..256, default 64
}

/** A bounded, versioned print-process starting point. It owns printer-dependent guards and
 * defaults, but it is deliberately not a claim that any uncalibrated printer/material combination
 * will achieve a given fit. Existing projects without a profile resolve to the legacy 0.4mm rules
 * so importing them preserves their generated geometry. */
export type ManufacturingProfileId =
  | 'fdm-legacy-0.4'
  | 'fdm-daily-pla-0.4'
  | 'fdm-daily-petg-0.4';

export interface ManufacturingProfile {
  id: ManufacturingProfileId;
  label: string;
  process: 'fdm';
  material: 'pla' | 'petg';
  nozzleDiameter: number;
  lineWidth: number;
  layerHeight: number;
  targetPerimeters: number;
  minPerimeters: number;
  supportFreeOverhangDeg: number;
  /** A fit must be confirmed with the target printer, material and slicer before it is trusted. */
  calibrated: boolean;
}

export type ScrewSize = 'M2' | 'M2.5' | 'M3' | 'M4';
export type ScrewInsertType = 'heat-set' | 'self-tap';
export type ScrewCount = 4 | 6 | 8;
/** Bounded starter recipes, named so a project can say what hardware assumption shaped its bosses.
 * They are intentionally not a claim of calibration for a particular insert vendor or printer. */
export type FastenerRecipeId =
  | 'starter-m2-heat-set'
  | 'starter-m2-self-tap'
  | 'starter-m2.5-heat-set'
  | 'starter-m2.5-self-tap'
  | 'starter-m3-heat-set'
  | 'starter-m3-self-tap'
  | 'starter-m4-heat-set'
  | 'starter-m4-self-tap';

/** Column cross-section shape. 'round' and 'square' are classic; 'hex', 'octagon', and 'rounded-square' offer elegant CAD mounting options. */
export type ScrewColumnShape = 'round' | 'square' | 'hex' | 'octagon' | 'rounded-square';

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
  /** Optional for legacy project JSON. When absent, the matching starter recipe is resolved from
   * size + insert type and keeps the prior geometry exactly. */
  recipeId?: FastenerRecipeId;
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
  /** Controls whether a shortened column has a 45° (or custom angle) sloped foot towards the wall. Default: true. */
  footEnabled?: boolean;
  /** Angle of the sloped foot in degrees (15..75). Default: 45. */
  footAngleDeg?: number;
}

/** How the removable lid is retained. `slide-rail` is available on flat-sided bodies; `bayonet`
 * is deliberately cylinder-only, where its turn-to-lock motion is physically meaningful. */
export type LidType = 'friction-lip' | 'screw-boss' | 'snap-fit' | 'slide-rail' | 'bayonet';
/** Surface language for an otherwise functional lid. Undefined keeps legacy/plain output. */
export type LidSurfaceTreatment = 'plain' | 'refined' | 'field-marked';

/** Phase 5 stretch feature (DESIGN.md §13): an O-ring/cord seal channel cut into the base's top
 * rim, independent of lid.type -- any lid type can be combined with a gasket channel. */
export interface GasketSpec {
  width: number; // mm, channel width
  depth: number; // mm, channel depth
}

/** Only for 'snap-fit'. Each tab position (two on a box/stadium, two on a cylinder, two opposite
 * facets on a hexagon/octagon) can split into several narrower cantilever fingers side by side,
 * separated by slots -- lower insertion force per finger and redundant catches instead of one wide
 * tab concentrating stress at its root. Undefined/1 = the original single-tab behaviour. */
export interface SnapFitSpec {
  fingerCount?: 1 | 2 | 3;
}

/** A captive cover that slides along the body length in two external U-channels. The open end is
 * intentionally removable; a flat-ended body can include a hard stop for its closed position. */
export interface SlideRailSpec {
  railDepth?: number; // mm below the lid plate; undefined = a profile-safe derived depth
}

/** Cylinder-only quarter-turn closure. Three lugs pass through the gaps between base shelves, then
 * rotate beneath them; no flexible ring or unsupported printed thread is assumed. */
export interface BayonetSpec {
  lugCount?: 2 | 3 | 4;
  turnDeg?: 30 | 45 | 60;
}

export interface LidSpec {
  type: LidType;
  splitHeight: number; // mm from base where the lid separates
  wallGap: number; // mm clearance for the fit (tune per printer)
  /** `refined` cuts a profile-safe recessed field into a box lid. `field-marked` also adds a
   * shallow seam accent around the lid perimeter. Both are intentionally opt-in so existing
   * project geometry and visual identity do not change on import. */
  surfaceTreatment?: LidSurfaceTreatment;
  screw?: ScrewSpec; // only for 'screw-boss'
  gasket?: GasketSpec; // present = channel cut, absent = no gasket channel
  snap?: SnapFitSpec; // only for 'snap-fit'
  slideRail?: SlideRailSpec; // only for 'slide-rail'
  bayonet?: BayonetSpec; // only for cylinder 'bayonet'
}

export type BodyShape = 'box' | 'cylinder' | 'hexagon' | 'octagon' | 'stadium' | 'wedge';

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
  /**
   * What actually holds the plate in. The plate's face is flush with the case's outer surface, so
   * a groove alone can only stop it falling *inward* -- to stop it falling *outward* something has
   * to overlap it from the outside. This is how much of the adjacent wall is left standing proud
   * of the plate at each end: the plate's ends are rebated to match, so they slide down behind that
   * lip and can't come back out sideways. 0 leaves the plate unretained (only sensible if you plan
   * to glue or screw it). Undefined takes the default; clamped so the rebated end keeps at least
   * 0.8mm of thickness.
   */
  retainLip?: number;
  /**
   * Screws through the plate's ends into posts standing in the case's interior corners. Absent =
   * no screws, the groove and its retaining lip do all the work (the original behaviour). Present =
   * the posts are printed as part of the base, bored for the chosen fastener, and the plate gets
   * matching clearance holes. Independent of `retainLip`: a plate can have both, which is the
   * combination worth printing when the case has to survive being opened repeatedly.
   */
  screw?: PanelScrewSpec;
}

/**
 * How a slide-in plate is screwed down. The screw axis is the panel's own normal, so the post it
 * threads into is a vertical column in the interior corner -- welded to the adjacent wall along its
 * full height, which is why it prints without any overhang of its own.
 */
export interface PanelScrewSpec {
  size: ScrewSize;
  insertType: ScrewInsertType;
  /** Screws at each end of the plate: 1 at mid-height, or 2 spaced toward its top and bottom. */
  countPerEnd: 1 | 2;
  /** 'counterbore' sinks the head into the plate so it finishes flush with the case. */
  headStyle: ScrewHeadStyle;
  /** Post footprint: `postWidth` along the face, `postDepth` into the case from the plate. */
  postWidth: number;
  postDepth: number;
}

export interface BoxBody {
  shape: 'box';
  outer: { length: number; width: number; height: number }; // mm
  wallThickness: number; // mm
  cornerStyle: CornerStyle;
  topEdgeBevel?: EdgeBevelSpec;
  bottomEdgeBevel?: EdgeBevelSpec;
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
  topEdgeBevel?: EdgeBevelSpec;
  bottomEdgeBevel?: EdgeBevelSpec;
  lid: LidSpec;
}

export interface HexagonBody {
  shape: 'hexagon';
  outer: { radius: number; height: number }; // mm outer vertex radius
  wallThickness: number; // mm
  topEdgeBevel?: EdgeBevelSpec;
  bottomEdgeBevel?: EdgeBevelSpec;
  lid: LidSpec;
}

export interface OctagonBody {
  shape: 'octagon';
  outer: { radius: number; height: number }; // mm outer vertex radius
  wallThickness: number; // mm
  topEdgeBevel?: EdgeBevelSpec;
  bottomEdgeBevel?: EdgeBevelSpec;
  lid: LidSpec;
}

export interface StadiumBody {
  shape: 'stadium';
  outer: { length: number; width: number; height: number }; // mm (width = diameter of semicircular ends)
  wallThickness: number; // mm
  cornerStyle: CornerStyle;
  topEdgeBevel?: EdgeBevelSpec;
  bottomEdgeBevel?: EdgeBevelSpec;
  lid: LidSpec;
}

export interface WedgeBody {
  shape: 'wedge';
  outer: { length: number; width: number; heightFront: number; heightBack: number }; // mm
  wallThickness: number; // mm
  cornerStyle: CornerStyle;
  topEdgeBevel?: EdgeBevelSpec;
  bottomEdgeBevel?: EdgeBevelSpec;
  lid: LidSpec;
}

export type EnclosureBody = BoxBody | CylinderBody | HexagonBody | OctagonBody | StadiumBody | WedgeBody;

export interface StandoffSpec {
  outerDiameter: number; // mm
  screwHoleDiameter: number; // mm
  height: number; // mm
  /** Conical collar flaring out from the floor to the standoff's own diameter -- same 45-degree
   * self-supporting blend as ExternalMountSpec.gusset, applied at the boss's root instead of a
   * wall. Prints without support and resists snapping off at the base. 0/undefined = a plain
   * cylinder, the original behaviour. */
  gusset?: number; // mm
}

export interface VentSpec {
  pattern: 'slots' | 'honeycomb';
  areaWidth: number;
  areaHeight: number;
  slotWidth: number;
  slotSpacing: number;
}

/** Friction-fit board retention: an L-shaped guide post at each of the board's 4 corners, hugging
 * both edges with a small clearance gap so the board drops in from above and is held in X/Y by the
 * posts (Z comes from the lid, or from resting on the posts' own top land). The screwless
 * alternative to holes + standoffs for boards with no documented mounting-hole pattern. */
export interface CornerGuideSpec {
  height: number; // mm, guide arm height -- normally boardThickness + clearance
  legLength: number; // mm, how far each L arm runs along the board edge from the corner
  armThickness: number; // mm, wall thickness of each L arm
  clearance: number; // mm, gap between the board edge and the guide's inner face
  chamfer?: number; // mm, lead-in chamfer at the top of each arm. 0/undefined = square top.
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
  /** Friction-fit corner posts, as an alternative or supplement to holes+standoff. When set and
   * `holes` is empty, no hole-based standoff is generated -- see buildBoardMount. */
  cornerGuides?: CornerGuideSpec;
  /** `auto` adds a thin wall tie to a floor post only when a box wall is close enough to reinforce
   * it without turning the board cavity into a solid block. Undefined keeps legacy post-only
   * geometry so existing projects are unchanged. */
  mountStrategy?: 'manual' | 'auto';
}

/** 'flange' is a flat ear standing out from a face (wall-mount tab); 'boss' is a cylindrical post
 * along the face's outward normal (external standoff / foot / spacer column); 'kickstand' is a
 * solid triangular prop leaning out from the face at an angle -- a fold-out-style stand for
 * propping the case up on a desk, or a leg/prop on a bottom face. */
export type ExternalMountStyle = 'flange' | 'boss' | 'kickstand';

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
  /** flange only: radius on the tab's plan-view corners. 0 or undefined keeps square corners. */
  edgeRadius?: number; // mm
  hole: ExternalMountHoleStyle;
  holeDiameter: number; // mm
  /** 'slot': total travel of the slot. 'keyhole': center distance between the big and small ends. */
  slotLength: number; // mm
  /**
   * How far the sloped brace where the mount meets the wall runs out from it, in mm. Without one a
   * mount is a slab butted onto a flat wall: it looks stuck on, and the sharp inside corner is
   * where it will snap off. A flange gets a triangular web at each end (clear of the middle, so the
   * screw stays reachable); a boss gets a conical collar. The slope is 45 degrees, which is what
   * lets it print without support. 0 removes it; undefined takes a default sized from the mount.
   */
  gusset?: number;
  /** boss only: blind hole depth measured from the boss's outer end. Undefined = drilled through. */
  holeDepth?: number; // mm
  /** kickstand only: slope of the wedge's tapered face, measured from the outward direction --
   * same convention as ScrewSpec.footAngleDeg. A steep angle (higher value) gives a tall, stubby
   * wedge; a shallow one gives a long, gentle ramp. Undefined = 50deg. Clamped to 20..70. */
  kickstandAngleDeg?: number;
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
  /** How deep the fan's own body is (40x40x10 -> 10). Nothing is cut or printed from this: it
   * drives the translucent ghost the viewport draws inside the case, which is how you check the
   * fan won't foul a HAT or heatsink under it. */
  bodyDepth: number;
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

/**
 * A blind pillar on the interior floor with no screw hole -- something for an unsupported board
 * edge to rest on. Carrier boards whose mounting holes are all down one side (the Waveshare CM4
 * base among them) cantilever the opposite edge over open air, and a connector pushed into that
 * edge flexes the PCB; a pad under it takes the load instead. Sized in plan and stopped just under
 * the board, so it supports without fighting the standoffs for the board's height.
 */
export interface SupportPadSpec {
  shape: 'rect' | 'round';
  /** rect: extent along the floor's u axis. round: diameter. */
  width: number;
  /** rect: extent along the floor's v axis. Ignored for a round pad. */
  depth: number;
  /** Height above the interior floor -- normally the same as the board's standoff height. */
  height: number;
  /** Repeat the pad in an evenly spaced row, centred on the feature's own position. 1 (or
   * undefined) is a single pad. A row is one feature that emits several pillars -- the same
   * arrangement a board-mount uses for its standoffs -- so it moves and edits as a unit. Rows are
   * for evenly supported edges; where the pads have to dodge components underneath, place them
   * individually instead. */
  count?: number;
  /** Centre-to-centre spacing of the repeats, mm. */
  pitch?: number;
  /** Which of the floor's axes the row runs along, before the feature's own rotation. */
  axis?: 'u' | 'v';
  /** Replaces a repeated rectangular pad row with one continuous low rail. This spreads a board
   * edge load across its span; leave it off where underside components need the gaps. */
  continuous?: boolean;
}

export interface GripRibsSpec {
  count: number; // e.g. 5 parallel slots
  depth: number; // mm cut into wall
  width: number; // mm slot width
  spacing: number; // mm pitch between slots
  orientation: 'horizontal' | 'vertical';
  span: number; // mm length of each slot along face
}

export type FeatureType =
  | 'connector-cutout'
  | 'standoff'
  | 'support-pad'
  | 'vent'
  | 'custom-hole'
  | 'board-mount'
  | 'external-mount'
  | 'fan-mount'
  | 'grip-ribs';

/** Per-placement size override for a connector cutout. Fields fall back to the library entry,
 * so overriding one dimension doesn't freeze the others. */
export interface ConnectorSizeOverride {
  diameter?: number; // mm
  width?: number; // mm
  height?: number; // mm (for 'dshape': the across-flat dimension)
}

/** A shallow exterior rim around a connector or custom opening. It is additive, profile-derived
 * local reinforcement rather than a blanket wall-thickness increase. */
export interface PortFrameSpec {
  border?: number; // mm, undefined = active profile rib floor
  depth?: number; // mm proud of the outer wall, undefined = active profile skin floor
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
  /** Identifies subtractive openings deliberately joined by overlapping relief cuts into one
   * compound opening. It preserves no narrow printable web between adjacent physical ports. */
  mergedOpeningGroup?: string;
  portFrame?: PortFrameSpec; // connector-cutout/custom-hole only
  standoff?: StandoffSpec;
  vent?: VentSpec;
  custom?: { shape: 'circle' | 'rect'; width: number; height?: number };
  board?: BoardMountSpec; // for 'board-mount'
  mount?: ExternalMountSpec; // for 'external-mount'
  fan?: FanMountSpec; // for 'fan-mount'
  pad?: SupportPadSpec; // for 'support-pad'
  ribs?: GripRibsSpec; // for 'grip-ribs'
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
  tessellation?: TessellationSpec;
  /** Optional for backward-compatible project JSON. Undefined resolves to fdm-legacy-0.4. */
  manufacturingProfile?: ManufacturingProfileId;
  body: EnclosureBody;
  features: Feature[];
}
