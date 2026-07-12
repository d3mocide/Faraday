import type { BoardPresetBody } from '../state/projectStore';
import type { BoardMountSpec } from '../types/project';

export interface BoardPreset {
  id: string;
  label: string;
  notes: string;
  body: BoardPresetBody;
  /** Present only where the board's mounting-hole pattern is officially documented (e.g. the
   * Raspberry Pi mechanical drawings) — applying the preset then drops in a centered
   * board-mount feature with the real hole layout. */
  boardMount?: BoardMountSpec;
}

/** Raspberry Pi 3B/4B/5 share one published pattern: 85x56mm board, four M2.5 holes 3.5mm in
 * from the corners on the left edge and a 58x49mm grid (so the pattern is NOT centered on the
 * board -- the right pair sits 23.5mm from the right edge). Offsets here are from board center. */
const PI_FULL_SIZE_MOUNT: BoardMountSpec = {
  boardWidth: 85,
  boardDepth: 56,
  boardThickness: 1.6,
  holes: [
    { x: -39, y: -24.5 },
    { x: 19, y: -24.5 },
    { x: -39, y: 24.5 },
    { x: 19, y: 24.5 },
  ],
  standoff: { outerDiameter: 6, screwHoleDiameter: 2.2, height: 4 },
};

/** Pi Zero family: 65x30mm board, M2.5 holes 3.5mm from every corner (58x23mm grid, centered). */
const PI_ZERO_MOUNT: BoardMountSpec = {
  boardWidth: 65,
  boardDepth: 30,
  boardThickness: 1.6,
  holes: [
    { x: -29, y: -11.5 },
    { x: 29, y: -11.5 },
    { x: -29, y: 11.5 },
    { x: 29, y: 11.5 },
  ],
  standoff: { outerDiameter: 6, screwHoleDiameter: 2.2, height: 4 },
};

/**
 * Starting points sized to comfortably fit the named board plus a few mm of clearance on each
 * side -- not measured against real hardware. Same "verify before printing" disclaimer as the
 * connector library (DESIGN.md §6): treat these as editable defaults, not exact specs. Applying a
 * preset sets body dimensions/wall thickness/split height and clears placed features (old
 * connector/standoff positions won't line up with the new board anyway); it doesn't touch lid
 * type, corner style, or units. Presets with a documented hole pattern (`boardMount`) also add a
 * centered board-mount feature; the rest stay dimension-only rather than guessing hole positions.
 */
export const BOARD_PRESETS: BoardPreset[] = [
  {
    id: 'rtl-sdr-dongle',
    label: 'RTL-SDR Dongle',
    notes: 'Fits a bare RTL-SDR V3-style PCB with room for the USB connector and an SMA bulkhead.',
    body: { outer: { length: 70, width: 35, height: 20 }, wallThickness: 2, splitHeight: 12 },
  },
  {
    id: 'heltec-lora32-v3',
    label: 'Heltec WiFi LoRa 32 V3',
    notes: 'Fits the board plus its OLED; leaves room for a USB-C cutout and an antenna passthrough.',
    body: { outer: { length: 56, width: 34, height: 16 }, wallThickness: 2, splitHeight: 10 },
  },
  {
    id: 'lilygo-t-beam',
    label: 'LILYGO T-Beam',
    notes: 'Sized for the board plus an 18650 cell in the battery holder.',
    body: { outer: { length: 120, width: 55, height: 25 }, wallThickness: 2, splitHeight: 16 },
  },
  {
    id: 'raspberry-pi-zero',
    label: 'Raspberry Pi Zero (W/2 W)',
    notes:
      'Fits the board with clearance for the header, micro-USB, and mini-HDMI ports. Includes the official 58x23mm M2.5 mounting pattern.',
    body: { outer: { length: 75, width: 40, height: 20 }, wallThickness: 2, splitHeight: 13 },
    boardMount: PI_ZERO_MOUNT,
  },
  {
    id: 'seeed-xiao',
    label: 'Seeed Studio XIAO (RP2040/ESP32-C3/SAMD21)',
    notes:
      'All XIAO variants share the same ~21x17.5mm board footprint; fits any of them with room for the USB-C port and a couple of pin headers.',
    body: { outer: { length: 30, width: 24, height: 14 }, wallThickness: 2, splitHeight: 9 },
  },
  {
    id: 'raspberry-pi-3-4',
    label: 'Raspberry Pi 3B/4B',
    notes:
      'Fits the full-size 85x56mm Pi board with clearance for the USB/Ethernet stack, GPIO header, and (on the 4B) micro-HDMI ports. Includes the official 58x49mm M2.5 mounting pattern.',
    body: { outer: { length: 100, width: 70, height: 30 }, wallThickness: 2, splitHeight: 20 },
    boardMount: PI_FULL_SIZE_MOUNT,
  },
  {
    id: 'raspberry-pi-5',
    label: 'Raspberry Pi 5',
    notes:
      'Same 85x56mm board footprint as the 3B/4B, sized a bit taller to leave headroom for the official active cooler. Includes the official 58x49mm M2.5 mounting pattern.',
    body: { outer: { length: 100, width: 70, height: 35 }, wallThickness: 2, splitHeight: 22 },
    boardMount: PI_FULL_SIZE_MOUNT,
  },
  {
    id: 'raspberry-pi-hat-stack',
    label: 'Raspberry Pi + HAT Stack',
    notes:
      'Extra-tall variant of the Pi 3/4/5 footprint to clear a stacked HAT board on the 40-pin GPIO header (header + HAT + standoffs). Includes the official 58x49mm M2.5 mounting pattern.',
    body: { outer: { length: 100, width: 70, height: 45 }, wallThickness: 2, splitHeight: 20 },
    boardMount: PI_FULL_SIZE_MOUNT,
  },
];
