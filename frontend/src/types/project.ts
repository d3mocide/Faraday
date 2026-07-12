export type Face = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'side';

export type Units = 'mm' | 'in';

export type CornerStyleType = 'sharp' | 'rounded' | 'chamfered';

export interface CornerStyle {
  type: CornerStyleType;
  radius: number; // mm, ignored if 'sharp'
}

export type ScrewSize = 'M2' | 'M2.5' | 'M3';
export type ScrewInsertType = 'heat-set' | 'self-tap';
export type ScrewCount = 4 | 6 | 8;

export interface ScrewSpec {
  size: ScrewSize;
  insertType: ScrewInsertType;
  count: ScrewCount;
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

export interface BoxBody {
  shape: 'box';
  outer: { length: number; width: number; height: number }; // mm
  wallThickness: number; // mm
  cornerStyle: CornerStyle;
  lid: LidSpec;
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

export type FeatureType = 'connector-cutout' | 'standoff' | 'vent' | 'custom-hole' | 'board-mount';

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
