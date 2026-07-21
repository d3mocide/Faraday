import type { BoardPresetBody } from '../state/projectStore';
import type { BoardMountSpec, Face } from '../types/project';
import {
  ARDUINO_MEGA_MOUNT,
  ARDUINO_UNO_MOUNT,
  BEAGLEBONE_BLACK_MOUNT,
  CM4_IO_MOUNT,
  FEATHER_MOUNT,
  PI_FULL_SIZE_MOUNT,
  PI_ZERO_MOUNT,
  PICO_MOUNT,
} from './boardMounts';

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
    label: 'Seeed Studio XIAO (SAMD21/RP2040/nRF52840)',
    notes:
      'These XIAO variants share the same ~20x17.5mm board footprint; fits any of them with room for the USB-C port and a couple of pin headers. No mounting holes on any XIAO board -- the family is designed to plug into shields via edge-castellated pins, not to be screwed down.',
    body: { outer: { length: 30, width: 24, height: 14 }, wallThickness: 2, splitHeight: 9 },
  },
  {
    id: 'seeed-xiao-esp32',
    label: 'Seeed Studio XIAO ESP32 (C3/S3/C6)',
    notes:
      "All three XIAO ESP32 variants share the same ~21x17.8mm footprint and a USB-C port centered on a short edge (position confirmed from Seeed's official pinout diagrams; exact centerline isn't dimensioned in a published drawing, so it's placed centered as a safe default). Like every XIAO board, there are no mounting holes -- dimension + USB-C cutout only. All three variants also carry an external U.FL/IPEX WiFi/BT antenna connector on the board (position not officially dimensioned) -- not cut here since routing it outside the case is optional and user-specific; add a small passthrough by hand if you need one.",
    body: { outer: { length: 30, width: 24, height: 15 }, wallThickness: 2, splitHeight: 9 },
    io: [{ connectorId: 'usb-c-panel', face: 'left', alongMm: 0, aboveBoardMm: 2.5 }],
  },
  {
    id: 'raspberry-pi-3',
    label: 'Raspberry Pi 3B',
    notes:
      "Fits the full-size 85x56mm Pi board with the official mounting pattern AND its own IO layout (the 3B's port arrangement differs from the 4B's -- notably Ethernet sits nearest the front edge here, the opposite order from the 4B): micro-USB power, full-size HDMI, combo audio/composite jack, 2x USB dual-stack, Ethernet, underside microSD. The audio/composite jack is really a 4-pole TRRS combo connector; the library's plain 3.5mm TRS entry is the closest available match, not exact. Port centerlines from the official mechanical drawing; heights are approximations -- verify before printing.",
    // Split height sits above the tallest port opening (the USB stacks top out ~23.4mm), same
    // margin as the 4B.
    body: { outer: { length: 100, width: 70, height: 30 }, wallThickness: 2, splitHeight: 24 },
    boardMount: PI_FULL_SIZE_MOUNT,
    // Front-edge centerlines (from the board's left edge): micro-USB power 10.6, HDMI 32.0,
    // audio/composite 53.5. Right-edge centerlines (from the board's front edge): Ethernet 10.25,
    // USB dual-stack #1 29.0, USB dual-stack #2 47.0. Converted to offsets from the 85x56 board
    // center. microSD position is not dimensioned in the official drawing (underside,
    // top-assembly-view-only) -- centered as a placeholder, same as every other Pi preset.
    io: [
      { connectorId: 'usb-micro-b', face: 'front', alongMm: -31.9, aboveBoardMm: 1.4 },
      { connectorId: 'hdmi-full-size', face: 'front', alongMm: -10.5, aboveBoardMm: 3.25 },
      { connectorId: 'audio-trs-3.5mm', face: 'front', alongMm: 11.0, aboveBoardMm: 3.0 },
      { connectorId: 'ethernet-rj45', face: 'right', alongMm: -17.75, aboveBoardMm: 6.8 },
      { connectorId: 'usb-a-dual-stack', face: 'right', alongMm: 1.0, aboveBoardMm: 8.0 },
      { connectorId: 'usb-a-dual-stack', face: 'right', alongMm: 19.0, aboveBoardMm: 8.0 },
      { connectorId: 'microsd-slot', face: 'left', alongMm: 0, aboveBoardMm: -2.8 },
    ],
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
      "Same 85x56mm board footprint as the 3B/4B, sized a bit taller to leave headroom for the official active cooler. Includes the official mounting pattern AND its own IO layout: USB-C power, 2x micro-HDMI, 2x USB dual-stack, Ethernet, underside microSD -- the 3.5mm audio jack was removed on the Pi 5, so unlike the 4B there is no audio cutout here. Same Ethernet-nearest-front port order as the 3B (not the 4B's order). Port centerlines from the official mechanical drawing, which also gives real connector-height side views for USB-C/micro-HDMI; heights are approximations elsewhere -- verify before printing.",
    // Split height sits above the tallest port opening (the USB stacks top out ~23.4mm), same
    // margin as the 3B/4B.
    body: { outer: { length: 100, width: 70, height: 35 }, wallThickness: 2, splitHeight: 24 },
    boardMount: PI_FULL_SIZE_MOUNT,
    // Front-edge centerlines (from the board's left edge): USB-C 11.2, HDMI0 25.8, HDMI1 39.2.
    // Right-edge centerlines (from the board's front edge): Ethernet 10.2, USB dual-stack #1 29.1,
    // USB dual-stack #2 47.0. Converted to offsets from the 85x56 board center. microSD position
    // is not dimensioned in the official drawing (underside) -- centered as a placeholder.
    io: [
      { connectorId: 'usb-c-panel', face: 'front', alongMm: -31.3, aboveBoardMm: 1.6 },
      { connectorId: 'hdmi-micro', face: 'front', alongMm: -16.7, aboveBoardMm: 1.6 },
      { connectorId: 'hdmi-micro', face: 'front', alongMm: -3.3, aboveBoardMm: 1.6 },
      { connectorId: 'ethernet-rj45', face: 'right', alongMm: -17.8, aboveBoardMm: 6.8 },
      { connectorId: 'usb-a-dual-stack', face: 'right', alongMm: 1.1, aboveBoardMm: 8.0 },
      { connectorId: 'usb-a-dual-stack', face: 'right', alongMm: 19.0, aboveBoardMm: 8.0 },
      { connectorId: 'microsd-slot', face: 'left', alongMm: 0, aboveBoardMm: -2.8 },
    ],
  },
  {
    id: 'raspberry-pi-hat-stack',
    label: 'Raspberry Pi + HAT Stack',
    notes:
      "Extra-tall variant of the Pi 3/4/5 footprint to clear a stacked HAT board on the 40-pin GPIO header (header + HAT + standoffs). Includes the official mounting pattern and inherits the 4B's IO layout (USB-C, 2x micro-HDMI, audio jack, 2x USB dual-stack, Ethernet, underside microSD) -- swap the IO list by hand if you're stacking on a 3B or 5 instead, since their port arrangements differ.",
    body: { outer: { length: 100, width: 70, height: 45 }, wallThickness: 2, splitHeight: 24 },
    boardMount: PI_FULL_SIZE_MOUNT,
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
    id: 'raspberry-pi-pico',
    label: 'Raspberry Pi Pico (/W/2)',
    notes:
      'Fits the 51x21mm board with the official mounting pattern and its one port: a micro-USB centered on the short edge. Datasheet-confirmed 1mm PCB thickness (thinner than most boards this size).',
    body: { outer: { length: 65, width: 35, height: 18 }, wallThickness: 2, splitHeight: 12 },
    boardMount: PICO_MOUNT,
    // The Pico's USB is centered (y=0) on a short edge, per the official datasheet's Figure 3.
    io: [{ connectorId: 'usb-micro-b', face: 'left', alongMm: 0, aboveBoardMm: 1.5 }],
  },
  {
    id: 'arduino-uno',
    label: 'Arduino Uno R3',
    notes:
      'Fits the 68.6x53.4mm board with the official mounting pattern and its two ports: USB-B and the DC barrel jack, both on the same short edge. Port positions sourced from the official Eagle CAD board files, cross-checked against the datasheet drawing.',
    body: { outer: { length: 85, width: 68, height: 35 }, wallThickness: 2, splitHeight: 22 },
    boardMount: ARDUINO_UNO_MOUNT,
    // Left-edge centerlines (from board center, Y axis): USB-B -11.43, DC jack +18.29.
    io: [
      { connectorId: 'usb-b-panel', face: 'left', alongMm: -11.43, aboveBoardMm: 5.5 },
      { connectorId: 'dc-barrel-5.5x2.1', face: 'left', alongMm: 18.29, aboveBoardMm: 4.0 },
    ],
  },
  {
    id: 'arduino-mega',
    label: 'Arduino Mega 2560',
    notes:
      'Fits the 101.6x53.34mm board with the official mounting pattern and its two ports: USB-B and the DC barrel jack, in the same corner layout as the Uno (confirmed from the Mega\'s own Eagle CAD file, not assumed identical).',
    body: { outer: { length: 120, width: 68, height: 35 }, wallThickness: 2, splitHeight: 22 },
    boardMount: ARDUINO_MEGA_MOUNT,
    // Same Y offsets as the Uno -- board depth is unchanged, only length grew.
    io: [
      { connectorId: 'usb-b-panel', face: 'left', alongMm: -11.43, aboveBoardMm: 5.5 },
      { connectorId: 'dc-barrel-5.5x2.1', face: 'left', alongMm: 18.29, aboveBoardMm: 4.0 },
    ],
  },
  {
    id: 'adafruit-feather',
    label: 'Adafruit Feather',
    notes:
      'Fits the shared 50.8x22.86mm Feather footprint with its official mounting pattern and its one port: a micro-USB centered on the short edge (some newer Feather variants use USB-C instead -- swap the cutout if yours does).',
    body: { outer: { length: 65, width: 38, height: 18 }, wallThickness: 2, splitHeight: 13 },
    boardMount: FEATHER_MOUNT,
    io: [{ connectorId: 'usb-micro-b', face: 'left', alongMm: 0, aboveBoardMm: 1.5 }],
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
    id: 'pi-cm4-io',
    label: 'Raspberry Pi CM4 IO Board',
    notes:
      'Fits the official 160x90mm CM4 IO Board carrier with its 7-hole mounting pattern (3 primary + 4 HAT-compatible) and edge IO: 2x full-size HDMI, Ethernet, a USB-A dual stack, microSD (CM4 Lite only), the DC barrel power jack, and the micro-USB rpiboot port. Does NOT model the vertical PCIe x1 socket -- that connector mounts perpendicular to the board (like a desktop PCIe slot) and needs its own internal height clearance, not a wall cutout; add manually if you need it. Board thickness and connector heights are unverified approximations -- verify before printing.',
    body: { outer: { length: 180, width: 105, height: 40 }, wallThickness: 2, splitHeight: 26 },
    boardMount: CM4_IO_MOUNT,
    // Bottom-edge centerlines (from the board's left edge, per the official drawing's own
    // dimension chain): HDMI0 23.0, HDMI1 48.0, Ethernet 74.0, USB dual-stack 93.0,
    // microSD 121.25, DC jack 145.0, micro-USB (rpiboot) 153.5. Converted to offsets from the
    // 160x90 board center.
    io: [
      { connectorId: 'hdmi-full-size', face: 'front', alongMm: -57, aboveBoardMm: 5.6 },
      { connectorId: 'hdmi-full-size', face: 'front', alongMm: -32, aboveBoardMm: 5.6 },
      { connectorId: 'ethernet-rj45', face: 'front', alongMm: -6, aboveBoardMm: 6.8 },
      { connectorId: 'usb-a-dual-stack', face: 'front', alongMm: 13, aboveBoardMm: 8.0 },
      { connectorId: 'microsd-slot', face: 'front', alongMm: 41.25, aboveBoardMm: -2.8 },
      { connectorId: 'dc-barrel-5.5x2.1', face: 'front', alongMm: 65, aboveBoardMm: 4.0 },
      { connectorId: 'usb-micro-b', face: 'front', alongMm: 73.5, aboveBoardMm: 1.5 },
    ],
  },
  {
    id: 'jetson-orin-nano-devkit',
    label: 'NVIDIA Jetson Orin Nano Developer Kit',
    notes:
      "Fits the official 100x79mm carrier board (P3768) with headroom for the module + stock heatsink/fan stack (34.77mm total kit height per NVIDIA's official mechanical spec) and its edge IO: DC power jack (takes a 2.5mm-pin plug, NOT the more common 2.1mm), DisplayPort, 2x USB-A 3.2, Ethernet, USB-C (recovery/data only, no power delivery on this board). No board-mount -- NVIDIA's public datasheet does not dimension mounting-hole positions and the official CAD reference-design package did not yield a confidently-verified hole pattern, so this stays dimension + IO only, per the 'don't guess' rule. Needs top ventilation for the fan (not modeled). MIPI-CSI camera connectors and the underside M.2 slots are internal, not cut.",
    body: { outer: { length: 112, width: 92, height: 46 }, wallThickness: 2, splitHeight: 38 },
    // Front-edge centerlines (from board center, CAD-sourced from the official Allegro
    // placement export): DC jack -48.0, DisplayPort -31.24, USB-A -11.4, USB-A +5.6,
    // Ethernet +22.95, USB-C +37.975. Heights above the floor assume a nominal ~4mm foot (no
    // board-mount standoff is generated here since the hole pattern is unconfirmed).
    io: [
      { connectorId: 'dc-barrel-5.5x2.1', face: 'front', alongMm: -48.0, aboveBoardMm: 9.6 },
      { connectorId: 'displayport-panel', face: 'front', alongMm: -31.24, aboveBoardMm: 8.0 },
      { connectorId: 'usb-a-dual-stack', face: 'front', alongMm: -11.4, aboveBoardMm: 13.4 },
      { connectorId: 'usb-a-dual-stack', face: 'front', alongMm: 5.6, aboveBoardMm: 13.4 },
      { connectorId: 'ethernet-rj45', face: 'front', alongMm: 22.95, aboveBoardMm: 12.35 },
      { connectorId: 'usb-c-panel', face: 'front', alongMm: 37.975, aboveBoardMm: 7.35 },
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
