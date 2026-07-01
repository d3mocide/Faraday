export type Face = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

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

export interface LidSpec {
  type: LidType;
  splitHeight: number; // mm from base where the lid separates
  wallGap: number; // mm clearance for the fit (tune per printer)
  screw?: ScrewSpec; // only for 'screw-boss'
}

export interface EnclosureBody {
  shape: 'box'; // extensible discriminated union, only 'box' ships in v1
  outer: { length: number; width: number; height: number }; // mm
  wallThickness: number; // mm
  cornerStyle: CornerStyle;
  lid: LidSpec;
}

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

export type FeatureType = 'connector-cutout' | 'standoff' | 'vent' | 'custom-hole';

export interface Feature {
  id: string;
  type: FeatureType;
  face: Face;
  u: number; // 0-1 normalized position across the face
  v: number; // 0-1 normalized position across the face
  rotationDeg: number; // rotation about the face normal
  connectorId?: string; // ref into ConnectorLibraryEntry, for 'connector-cutout'
  standoff?: StandoffSpec;
  vent?: VentSpec;
  custom?: { shape: 'circle' | 'rect'; width: number; height?: number };
}

export type ConnectorCategory = 'rf' | 'usb' | 'power' | 'antenna' | 'misc';

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
  units: 'mm' | 'in'; // display preference only, geometry is always canonical mm
  createdAt: string;
  updatedAt: string;
  body: EnclosureBody;
  features: Feature[];
}
