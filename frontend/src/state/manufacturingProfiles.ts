import type { EnclosureProject, ManufacturingProfile, ManufacturingProfileId } from '../types/project';

/**
 * Curated starting points, not printer certification. The legacy profile exactly reproduces the
 * project's former 0.4mm-nozzle guard dimensions, which is why absent profile fields remain safe
 * to load from old project JSON.
 */
export const MANUFACTURING_PROFILES: readonly ManufacturingProfile[] = [
  {
    id: 'fdm-legacy-0.4',
    label: 'Legacy FDM · 0.4 mm nozzle',
    process: 'fdm',
    material: 'pla',
    nozzleDiameter: 0.4,
    lineWidth: 0.4,
    layerHeight: 0.2,
    targetPerimeters: 3,
    minPerimeters: 2,
    supportFreeOverhangDeg: 45,
    calibrated: false,
  },
  {
    id: 'fdm-daily-pla-0.4',
    label: 'Daily PLA · 0.4 mm nozzle',
    process: 'fdm',
    material: 'pla',
    nozzleDiameter: 0.4,
    lineWidth: 0.45,
    layerHeight: 0.2,
    targetPerimeters: 4,
    minPerimeters: 3,
    supportFreeOverhangDeg: 45,
    calibrated: false,
  },
  {
    id: 'fdm-daily-petg-0.4',
    label: 'Daily PETG · 0.4 mm nozzle',
    process: 'fdm',
    material: 'petg',
    nozzleDiameter: 0.4,
    lineWidth: 0.45,
    layerHeight: 0.2,
    targetPerimeters: 4,
    minPerimeters: 3,
    supportFreeOverhangDeg: 45,
    calibrated: false,
  },
];

const BY_ID = new Map(MANUFACTURING_PROFILES.map((profile) => [profile.id, profile]));

export function manufacturingProfile(id: ManufacturingProfileId | undefined): ManufacturingProfile {
  return BY_ID.get(id ?? 'fdm-legacy-0.4') ?? MANUFACTURING_PROFILES[0];
}

export function manufacturingProfileForProject(project: Pick<EnclosureProject, 'manufacturingProfile'>): ManufacturingProfile {
  return manufacturingProfile(project.manufacturingProfile);
}
