import type { ConnectorLibraryEntry } from '../types/project';

/**
 * v1 starter set (DESIGN.md §6). These are typical/starting values pulled from datasheets and
 * panel-mount references, not guaranteed specs for any specific part — verify against your actual
 * hardware with calipers before a real print. Tolerances also depend on printer calibration
 * (holes usually print slightly undersized).
 */
export const CONNECTOR_LIBRARY: ConnectorLibraryEntry[] = [
  {
    id: 'sma-bulkhead-female',
    label: 'SMA Bulkhead (F)',
    category: 'rf',
    holeShape: 'circle',
    diameter: 6.5,
    notes: 'Consistent across multiple connector manufacturer references (6.3-6.6mm range).',
  },
  {
    id: 'bnc-bulkhead',
    label: 'BNC Bulkhead',
    category: 'rf',
    holeShape: 'circle',
    diameter: 9.6,
    notes: 'BNC hole size varies more by style than SMA — verify against your specific part.',
  },
  {
    id: 'usb-c-panel',
    label: 'USB-C Port Cutout',
    category: 'usb',
    holeShape: 'rect',
    width: 9.0,
    height: 3.5,
    cornerRadius: 0.8,
    notes: 'Port opening only; widen if the connector shell needs clearance.',
  },
  {
    id: 'usb-a-panel',
    label: 'USB-A Port Cutout',
    category: 'usb',
    holeShape: 'rect',
    width: 13.0,
    height: 6.5,
    cornerRadius: 1.0,
    notes: 'Approximate, verify against your specific connector.',
  },
  {
    id: 'dc-barrel-5.5x2.1',
    label: 'DC Barrel Jack (5.5x2.1mm)',
    category: 'power',
    holeShape: 'circle',
    diameter: 8.0,
    notes: 'Common panel-mount barrel jack.',
  },
  {
    id: 'antenna-passthrough',
    label: 'Antenna Pass-Through Grommet',
    category: 'antenna',
    holeShape: 'circle',
    diameter: 10.0,
    notes:
      'No universal standard — this default is just a placeholder. Always verify/resize for your grommet.',
  },
];

export function findConnector(id: string): ConnectorLibraryEntry | undefined {
  return CONNECTOR_LIBRARY.find((entry) => entry.id === id);
}
