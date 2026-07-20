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
  {
    id: 'hdmi-full-size',
    label: 'HDMI (Type A) Cutout',
    category: 'video',
    holeShape: 'rect',
    width: 15.0,
    height: 11.2,
    cornerRadius: 1.0,
    notes: 'Full-size HDMI receptacle shell opening — verify against your specific connector.',
  },
  {
    id: 'hdmi-mini',
    label: 'Mini-HDMI (Type C) Cutout',
    category: 'video',
    holeShape: 'rect',
    width: 11.5,
    height: 3.5,
    cornerRadius: 0.5,
    notes: 'Mini-HDMI receptacle shell opening — verify against your specific connector.',
  },
  {
    id: 'hdmi-micro',
    label: 'Micro-HDMI (Type D) Cutout',
    category: 'video',
    holeShape: 'rect',
    width: 8.5,
    height: 3.1,
    cornerRadius: 0.5,
    notes: 'Micro-HDMI receptacle shell opening (common on Raspberry Pi 4/5) — verify against your specific connector.',
  },
  {
    id: 'ethernet-rj45',
    label: 'Ethernet (RJ45) Cutout',
    category: 'network',
    holeShape: 'rect',
    width: 16.0,
    height: 13.5,
    cornerRadius: 1.0,
    notes: 'Standard shielded RJ45 jack opening — verify against your specific part (some styles have side latch tabs).',
  },
  {
    id: 'usb-micro-b',
    label: 'Micro-USB (B) Panel Cutout',
    category: 'usb',
    holeShape: 'rect',
    width: 8.5,
    height: 3.0,
    cornerRadius: 0.8,
    notes: 'Micro-USB receptacle shell opening — verify against your specific connector.',
  },
  {
    id: 'usb-b-panel',
    label: 'USB-B Panel Cutout',
    category: 'usb',
    holeShape: 'rect',
    width: 12.0,
    height: 11.0,
    cornerRadius: 1.0,
    notes: 'Standard USB-B (e.g. printer/MIDI cable) receptacle shell opening — verify against your specific connector.',
  },
  {
    id: 'audio-trs-3.5mm',
    label: '3.5mm TRS Audio Jack',
    category: 'audio',
    holeShape: 'circle',
    diameter: 6.0,
    notes: 'Clearance for a panel-mount 3.5mm jack\'s threaded bushing — narrower than most, verify against your specific part.',
  },
  {
    id: 'iec-c14-inlet',
    label: 'IEC C14 Power Inlet',
    category: 'power',
    holeShape: 'rect',
    width: 27.8,
    height: 19.9,
    cornerRadius: 1.0,
    notes: 'Standard unswitched/unfused IEC C14 panel cutout — verify against your specific inlet (some have integrated switch/fuse and need a larger cutout).',
  },
  {
    id: 'toggle-switch-d',
    label: 'Toggle Switch (D-hole)',
    category: 'misc',
    holeShape: 'dshape',
    diameter: 6.4,
    height: 5.8, // across-flat: flat side to round side
    notes:
      'Anti-rotation D hole for a panel toggle/rocker with a keyed bushing — verify diameter and flat against your switch.',
  },
  {
    id: 'usb-a-dual-stack',
    label: 'USB-A Dual Stack Cutout',
    category: 'usb',
    holeShape: 'rect',
    width: 13.3,
    height: 15.6,
    cornerRadius: 1.0,
    notes:
      'Opening for a stacked double USB-A receptacle (Raspberry Pi style) — verify against your specific connector.',
  },
  {
    id: 'microsd-slot',
    label: 'MicroSD Card Slot',
    category: 'misc',
    holeShape: 'rect',
    width: 12.0,
    height: 3.0,
    cornerRadius: 0.5,
    notes:
      'Access slot for a push-fit microSD card (card is 11x1mm; extra clearance for fingers/angle) — verify against your board.',
  },
  {
    id: 'cable-gland-pg7',
    label: 'PG7 Cable Gland',
    category: 'misc',
    holeShape: 'circle',
    diameter: 12.5,
    notes:
      'Clearance for a PG7 gland thread (3-6.5mm cable) — the go-to for sealed cable entry on outdoor radio boxes. Verify against your gland.',
  },
  {
    id: 'cable-gland-pg9',
    label: 'PG9 Cable Gland',
    category: 'misc',
    holeShape: 'circle',
    diameter: 15.2,
    notes:
      'Clearance for a PG9 gland thread (4-8mm cable). Verify against your gland.',
  },
  {
    id: 'cable-gland-pg11',
    label: 'PG11 Cable Gland',
    category: 'misc',
    holeShape: 'circle',
    diameter: 18.6,
    notes:
      'Clearance for a PG11 gland thread (5-10mm cable). Verify against your gland.',
  },
];

export function findConnector(id: string): ConnectorLibraryEntry | undefined {
  return CONNECTOR_LIBRARY.find((entry) => entry.id === id);
}
