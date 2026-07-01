import type { Units } from '../types/project';

const MM_PER_INCH = 25.4;

/** Display-only conversions -- the store always holds canonical mm (DESIGN.md §5). */
export function mmToDisplay(mm: number, units: Units): number {
  return units === 'in' ? mm / MM_PER_INCH : mm;
}

export function displayToMm(value: number, units: Units): number {
  return units === 'in' ? value * MM_PER_INCH : value;
}

export function displayStep(mmStep: number, units: Units): number {
  return units === 'in' ? mmStep / MM_PER_INCH : mmStep;
}

export function unitLabel(units: Units): string {
  return units;
}

export function roundForDisplay(value: number, units: Units): number {
  const decimals = units === 'in' ? 3 : 2;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
