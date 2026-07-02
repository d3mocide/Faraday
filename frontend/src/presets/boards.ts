import type { BoardPresetBody } from '../state/projectStore';

export interface BoardPreset {
  id: string;
  label: string;
  notes: string;
  body: BoardPresetBody;
}

/**
 * Starting points sized to comfortably fit the named board plus a few mm of clearance on each
 * side -- not measured against real hardware. Same "verify before printing" disclaimer as the
 * connector library (DESIGN.md §6): treat these as editable defaults, not exact specs. Applying a
 * preset only sets body dimensions/wall thickness/split height and clears placed features (old
 * connector/standoff positions won't line up with the new board anyway); it doesn't touch lid
 * type, corner style, or units.
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
    notes: 'Fits the board with clearance for the header, micro-USB, and mini-HDMI ports.',
    body: { outer: { length: 75, width: 40, height: 20 }, wallThickness: 2, splitHeight: 13 },
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
      'Fits the full-size 85x56mm Pi board with clearance for the USB/Ethernet stack, GPIO header, and (on the 4B) micro-HDMI ports.',
    body: { outer: { length: 100, width: 70, height: 30 }, wallThickness: 2, splitHeight: 20 },
  },
  {
    id: 'raspberry-pi-5',
    label: 'Raspberry Pi 5',
    notes:
      'Same 85x56mm board footprint as the 3B/4B, sized a bit taller to leave headroom for the official active cooler.',
    body: { outer: { length: 100, width: 70, height: 35 }, wallThickness: 2, splitHeight: 22 },
  },
  {
    id: 'raspberry-pi-hat-stack',
    label: 'Raspberry Pi + HAT Stack',
    notes:
      'Extra-tall variant of the Pi 3/4/5 footprint to clear a stacked HAT board on the 40-pin GPIO header (header + HAT + standoffs) — no board-specific standoff pattern, just clearance.',
    body: { outer: { length: 100, width: 70, height: 45 }, wallThickness: 2, splitHeight: 20 },
  },
];
