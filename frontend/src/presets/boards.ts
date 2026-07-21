import type { BoardPresetBody } from '../state/projectStore';
import type { BoardMountSpec, Face } from '../types/project';
import { BEAGLEBONE_BLACK_MOUNT, PI_FULL_SIZE_MOUNT, PI_ZERO_MOUNT } from './boardMounts';

/** One wall cutout in a preset's IO layout, positioned relative to the (centered) board rather
 * than the enclosure, so the same layout survives a body-size tweak of the preset. Horizontal
 * placement follows the face's u axis (+X for front/back, +Y for left/right — see
 * csg/faceFrame.ts); vertical placement is measured from the board's TOP surface (negative for
 * underside ports like a microSD slot). Port centerlines come from the board's official
 * mechanical drawing; the mm-above-board heights are connector-datasheet approximations — same
 * "verify before printing" tier as the connector library. On a preset with no `boardMount` (a
 * board-less starter like the sealed outdoor node), there's no board top to measure from, so
 * `aboveBoardMm` is re-anchored to the interior floor instead — see buildPresetFeatures. */
export interface BoardIoCutout {
  /** Connector library entry to cut... */
  connectorId?: string;
  /** ...or a one-off custom hole for ports with no library entry. */
  custom?: { shape: 'circle' | 'rect'; width: number; height?: number };
  face: Face;
  alongMm: number;
  aboveBoardMm: number;
}

export interface BoardPreset {
  id: string;
  label: string;
  notes: string;
  body: BoardPresetBody;
  /** Present only where the board's mounting-hole pattern is officially documented (e.g. the
   * Raspberry Pi mechanical drawings) — applying the preset then drops in a centered
   * board-mount feature with the real hole layout. Shared with the palette's placeable
   * board-mount presets (`presets/boardMounts.ts`) so the two stay in sync. */
  boardMount?: BoardMountSpec;
  /** Wall cutouts for the board's IO ports, only meaningful alongside `boardMount` (positions
   * derive from the centered board). Present only where port centerlines are documented. */
  io?: BoardIoCutout[];
}

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
      'Fits the board with the official 58x23mm M2.5 mounting pattern and the IO layout cut into the walls: mini-HDMI, both micro-USB ports, and the microSD slot. Port heights are approximations — verify before printing.',
    body: { outer: { length: 75, width: 40, height: 20 }, wallThickness: 2, splitHeight: 13 },
    boardMount: PI_ZERO_MOUNT,
    // Front-edge centerlines (from the board's left edge): mini-HDMI 12.4, USB OTG 41.4,
    // USB PWR 54.0, per the official drawing. Converted to offsets from the 65x30 board center.
    // The Zero's microSD is top-mounted on the left edge (unlike the full-size Pis' underside slot).
    io: [
      { connectorId: 'hdmi-mini', face: 'front', alongMm: -20.1, aboveBoardMm: 1.6 },
      { connectorId: 'usb-micro-b', face: 'front', alongMm: 8.9, aboveBoardMm: 1.4 },
      { connectorId: 'usb-micro-b', face: 'front', alongMm: 21.5, aboveBoardMm: 1.4 },
      { connectorId: 'microsd-slot', face: 'left', alongMm: 0, aboveBoardMm: 1.0 },
    ],
  },
  {
    id: 'seeed-xiao',
    label: 'Seeed Studio XIAO (RP2040/ESP32-C3/SAMD21)',
    notes:
      'All XIAO variants share the same ~21x17.5mm board footprint; fits any of them with room for the USB-C port and a couple of pin headers.',
    body: { outer: { length: 30, width: 24, height: 14 }, wallThickness: 2, splitHeight: 9 },
  },
  {
    id: 'raspberry-pi-3',
    label: 'Raspberry Pi 3B',
    notes:
      'Fits the full-size 85x56mm Pi board with clearance for the USB/Ethernet stack and GPIO header. Includes the official 58x49mm M2.5 mounting pattern (no IO layout — the 3B port arrangement differs from the 4B).',
    body: { outer: { length: 100, width: 70, height: 30 }, wallThickness: 2, splitHeight: 20 },
    boardMount: PI_FULL_SIZE_MOUNT,
  },
  {
    id: 'raspberry-pi-4',
    label: 'Raspberry Pi 4B',
    notes:
      'Fits the 85x56mm 4B with the official mounting pattern AND its full IO layout cut into the walls: USB-C, 2x micro-HDMI, audio jack, 2x USB stacks, Ethernet, microSD slot. Port centerlines from the official drawing; heights are approximations — verify before printing.',
    // Split height sits above the tallest port opening (the USB stacks top out ~23.5mm) so every
    // cutout lands cleanly in the base rather than straddling the lid seam.
    body: { outer: { length: 100, width: 70, height: 30 }, wallThickness: 2, splitHeight: 24 },
    boardMount: PI_FULL_SIZE_MOUNT,
    // Front-edge centerlines (from the board's left edge): USB-C 11.2, HDMI0 26.0, HDMI1 39.5,
    // audio 54.0. Right-edge centerlines (from the board's front edge): USB2 9.0, USB3 27.0,
    // Ethernet 45.75. Converted to offsets from the 85x56 board center.
    io: [
      { connectorId: 'usb-c-panel', face: 'front', alongMm: -31.3, aboveBoardMm: 1.6 },
      { connectorId: 'hdmi-micro', face: 'front', alongMm: -16.5, aboveBoardMm: 1.6 },
      { connectorId: 'hdmi-micro', face: 'front', alongMm: -3.0, aboveBoardMm: 1.6 },
      { connectorId: 'audio-trs-3.5mm', face: 'front', alongMm: 11.5, aboveBoardMm: 3.0 },
      { connectorId: 'usb-a-dual-stack', face: 'right', alongMm: -19.0, aboveBoardMm: 8.0 },
      { connectorId: 'usb-a-dual-stack', face: 'right', alongMm: -1.0, aboveBoardMm: 8.0 },
      { connectorId: 'ethernet-rj45', face: 'right', alongMm: 17.75, aboveBoardMm: 6.8 },
      { connectorId: 'microsd-slot', face: 'left', alongMm: 0, aboveBoardMm: -2.8 },
    ],
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
  {
    id: 'beaglebone-black',
    label: 'BeagleBone Black',
    notes:
      'Fits the 86.4x54.6mm board with the official (non-corner-symmetric) M3 mounting pattern and its IO layout: DC barrel jack, Mini-USB client, Ethernet on one short edge; USB-A host, micro-HDMI, and the underside microSD slot on the other. Board width has a documentation discrepancy in the official SRM (53.34mm prose vs. 54.61mm in the dimensioned drawing) -- 54.61mm is used here, cross-checked against the mounting-hole symmetry; verify before printing.',
    body: { outer: { length: 105, width: 75, height: 35 }, wallThickness: 2, splitHeight: 24 },
    boardMount: BEAGLEBONE_BLACK_MOUNT,
    // Left-edge centerlines (from board center, Y axis): DC jack -17.78, Ethernet +6.985,
    // Mini-USB +16.8275. Right-edge centerlines: USB-A -13.97, micro-HDMI -2.159, microSD +3.955.
    // Sourced from BeagleBoard.org's official assembly/placement data (Rev C); connector heights
    // above the board are datasheet-derived approximations, same tier as the connector library.
    io: [
      { connectorId: 'dc-barrel-5.5x2.1', face: 'left', alongMm: -17.78, aboveBoardMm: 4.0 },
      { connectorId: 'ethernet-rj45', face: 'left', alongMm: 6.985, aboveBoardMm: 6.8 },
      { connectorId: 'usb-mini-b', face: 'left', alongMm: 16.8275, aboveBoardMm: 1.6 },
      { connectorId: 'usb-a-panel', face: 'right', alongMm: -13.97, aboveBoardMm: 4.5 },
      { connectorId: 'hdmi-micro', face: 'right', alongMm: -2.159, aboveBoardMm: 1.6 },
      { connectorId: 'microsd-slot', face: 'right', alongMm: 3.955, aboveBoardMm: -2.5 },
    ],
  },
  {
    id: 'sealed-outdoor-node',
    label: 'Sealed Outdoor Node (starter)',
    notes:
      'Non-board starter for a weatherproof outdoor radio project: gasket channel enabled by default, an SMA bulkhead on the front wall for an antenna, and a PG9 cable gland on the back wall for a sealed power/data cable entry. Dimension-only otherwise -- drop in your own board-mount and standoffs to fit your hardware. Does not attempt pole/mast mounting clamps (not yet implemented in this app).',
    body: {
      outer: { length: 110, width: 70, height: 40 },
      wallThickness: 3,
      splitHeight: 22,
      gasket: { width: 2, depth: 1.5 },
    },
    io: [
      { connectorId: 'sma-bulkhead-female', face: 'front', alongMm: 0, aboveBoardMm: 11 },
      { connectorId: 'cable-gland-pg9', face: 'back', alongMm: 0, aboveBoardMm: 8 },
    ],
  },
];
