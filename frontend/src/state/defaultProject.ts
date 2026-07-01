import type { EnclosureProject } from '../types/project';

export function createDefaultProject(): EnclosureProject {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: 'Untitled Enclosure',
    units: 'mm',
    createdAt: now,
    updatedAt: now,
    body: {
      shape: 'box',
      outer: { length: 80, width: 50, height: 30 },
      wallThickness: 2,
      cornerStyle: { type: 'rounded', radius: 3 },
      lid: {
        type: 'screw-boss',
        splitHeight: 24,
        wallGap: 0.2,
        screw: { size: 'M3', insertType: 'heat-set', count: 4 },
      },
    },
    features: [],
  };
}
