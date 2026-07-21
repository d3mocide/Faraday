import type { BoardMountSpec } from '../types/project';

/** A palette-placeable board-mount preset: a named PCB outline plus its mounting-hole pattern.
 * Hole offsets are mm from the board center (the BoardMountSpec convention). Patterns are taken
 * from officially published mechanical drawings/datasheets where they exist — same "verify with
 * calipers before printing" disclaimer as the connector library (DESIGN.md §6). */
export interface BoardMountPreset {
  id: string;
  label: string;
  /** Short dimension badge shown on the palette card, e.g. "85×56mm". */
  badge: string;
  notes: string;
  mount: BoardMountSpec;
}

/** Raspberry Pi 3B/4B/5 share one published pattern: 85x56mm board, four M2.5 holes 3.5mm in
 * from the corners on the left edge and a 58x49mm grid (so the pattern is NOT centered on the
 * board -- the right pair sits 23.5mm from the right edge). Offsets here are from board center. */
export const PI_FULL_SIZE_MOUNT: BoardMountSpec = {
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
export const PI_ZERO_MOUNT: BoardMountSpec = {
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

/** BeagleBone Black: 86.36x54.61mm board (per the official dimensioned drawing at
 * docs.beagleboard.org/boards/beaglebone/black/ch09.html -- the page's own prose text says
 * 53.34mm, which conflicts with that same drawing's mounting-hole symmetry; 54.61mm is what the
 * hole geometry cross-checks against, so it's used here, flagged as a documentation discrepancy
 * worth a caliper check). NOT a corner-symmetric pattern: 4x M3 holes, the left pair sits
 * 14.605mm in from the left edge, the right pair only 6.35mm in from the right edge. */
export const BEAGLEBONE_BLACK_MOUNT: BoardMountSpec = {
  boardWidth: 86.36,
  boardDepth: 54.61,
  boardThickness: 1.6,
  holes: [
    { x: -28.575, y: -24.13 },
    { x: 37.465, y: -20.955 },
    { x: -28.575, y: 24.13 },
    { x: 37.465, y: 20.955 },
  ],
  standoff: { outerDiameter: 7, screwHoleDiameter: 3.2, height: 4 },
};

/** Pico (/W/2): 51x21mm board, official datasheet-confirmed 1mm PCB thickness (not the usual
 * 1.6mm), four M2 holes on a 47x11.4mm grid, 2mm in from the short edges, centered. */
export const PICO_MOUNT: BoardMountSpec = {
  boardWidth: 51,
  boardDepth: 21,
  boardThickness: 1,
  holes: [
    { x: -23.5, y: -5.7 },
    { x: 23.5, y: -5.7 },
    { x: -23.5, y: 5.7 },
    { x: 23.5, y: 5.7 },
  ],
  standoff: { outerDiameter: 5, screwHoleDiameter: 1.8, height: 4 },
};

/** Arduino Uno R3: 68.6x53.4mm board, classic 4-hole M3 pattern (irregular, not corner-symmetric)
 * from the official board drawing. */
export const ARDUINO_UNO_MOUNT: BoardMountSpec = {
  boardWidth: 68.6,
  boardDepth: 53.4,
  boardThickness: 1.6,
  holes: [
    { x: -20.32, y: -24.13 },
    { x: -19.05, y: 24.13 },
    { x: 31.75, y: -8.89 },
    { x: 31.75, y: 19.05 },
  ],
  standoff: { outerDiameter: 7, screwHoleDiameter: 2.7, height: 4 },
};

/** Arduino Mega 2560: 101.6x53.34mm board, Uno-compatible 4-hole pattern plus two extra holes on
 * the long end (M3), per the official board drawing. */
export const ARDUINO_MEGA_MOUNT: BoardMountSpec = {
  boardWidth: 101.6,
  boardDepth: 53.34,
  boardThickness: 1.6,
  holes: [
    { x: -36.83, y: -24.13 },
    { x: -35.56, y: 24.13 },
    { x: 15.24, y: -8.89 },
    { x: 15.24, y: 19.05 },
    { x: 45.72, y: -24.13 },
    { x: 39.37, y: 24.13 },
  ],
  standoff: { outerDiameter: 7, screwHoleDiameter: 2.7, height: 4 },
};

/** Shared Feather-spec footprint: 50.8x22.86mm board, four 2.5mm holes inset 2.54mm from the
 * corners (45.72x17.78mm grid). PCB thickness is not stated anywhere in Adafruit's spec --
 * 1.6mm is an unverified industry-standard assumption, same as the two Arduino boards above. */
export const FEATHER_MOUNT: BoardMountSpec = {
  boardWidth: 50.8,
  boardDepth: 22.86,
  boardThickness: 1.6,
  holes: [
    { x: -22.86, y: -8.89 },
    { x: 22.86, y: -8.89 },
    { x: -22.86, y: 8.89 },
    { x: 22.86, y: 8.89 },
  ],
  standoff: { outerDiameter: 5, screwHoleDiameter: 2.2, height: 4 },
};

/** Raspberry Pi Compute Module 4 IO Board: 160x90mm carrier, per the official mechanical drawing
 * (raspberrypi.com/documentation, CM4 IO Board datasheet Ch.3 Fig.2). Combines the 3-hole
 * asymmetric primary mounting pattern with the 4-hole 58x49mm HAT-compatible pattern the
 * datasheet explicitly calls out ("mounting holes are also provided so that standard HATs may be
 * used") -- 7 usable standoff points total. The CM4 module's own 4 support-pillar holes (inboard,
 * for the module itself, not the enclosure) are deliberately excluded. M2.5 (2.7mm) holes. */
export const CM4_IO_MOUNT: BoardMountSpec = {
  boardWidth: 160,
  boardDepth: 90,
  boardThickness: 1.6, // not stated in the official datasheet -- unverified standard-PCB assumption
  holes: [
    { x: -69, y: -37 },
    { x: -69, y: 32 },
    { x: 65, y: 32 },
    { x: -76.5, y: -41.5 },
    { x: -18.5, y: -41.5 },
    { x: -76.5, y: 7.5 },
    { x: -18.5, y: 7.5 },
  ],
  standoff: { outerDiameter: 6, screwHoleDiameter: 2.7, height: 4 },
};

export const BOARD_MOUNT_PRESETS: BoardMountPreset[] = [
  {
    id: 'pi-full-size',
    label: 'Raspberry Pi 3B/4B/5',
    badge: '85×56mm',
    notes: 'Official 58×49mm M2.5 pattern from the Pi mechanical drawings — intentionally off-center on the board.',
    mount: PI_FULL_SIZE_MOUNT,
  },
  {
    id: 'pi-zero',
    label: 'Raspberry Pi Zero (W/2 W)',
    badge: '65×30mm',
    notes: 'Official 58×23mm M2.5 pattern, centered, holes 3.5mm from each corner.',
    mount: PI_ZERO_MOUNT,
  },
  {
    id: 'pi-pico',
    label: 'Raspberry Pi Pico (/W/2)',
    badge: '51×21mm',
    notes: 'Datasheet 47×11.4mm pattern, four M2 holes 2mm in from the short edges, centered.',
    mount: PICO_MOUNT,
  },
  {
    id: 'arduino-uno',
    label: 'Arduino Uno R3',
    badge: '68.6×53.4mm',
    notes: 'Classic 4-hole Arduino pattern from the official board drawing (M3, irregular layout — not corner-symmetric).',
    mount: ARDUINO_UNO_MOUNT,
  },
  {
    id: 'arduino-mega',
    label: 'Arduino Mega 2560',
    badge: '101.6×53.3mm',
    notes: 'Uno-compatible 4-hole pattern plus two extra holes on the long end (M3), per the official board drawing.',
    mount: ARDUINO_MEGA_MOUNT,
  },
  {
    id: 'adafruit-feather',
    label: 'Adafruit Feather',
    badge: '50.8×22.9mm',
    notes: 'Shared Feather-spec footprint: four 2.5mm holes inset 2.54mm from the corners (45.72×17.78mm grid).',
    mount: FEATHER_MOUNT,
  },
  {
    id: 'beaglebone-black',
    label: 'BeagleBone Black',
    badge: '86.4×54.6mm',
    notes:
      'Official mounting pattern from the BeagleBoard.org SRM mechanical drawing -- NOT corner-symmetric (M3, right pair sits closer to its edge than the left pair).',
    mount: BEAGLEBONE_BLACK_MOUNT,
  },
  {
    id: 'pi-cm4-io',
    label: 'Raspberry Pi CM4 IO Board',
    badge: '160×90mm',
    notes:
      '7-hole pattern from the official mechanical drawing: 3 primary mounting holes plus the 4-hole 58×49mm HAT-compatible pattern (M2.5).',
    mount: CM4_IO_MOUNT,
  },
];

export function findBoardMountPreset(id: string): BoardMountPreset | undefined {
  return BOARD_MOUNT_PRESETS.find((preset) => preset.id === id);
}
