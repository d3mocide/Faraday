import type { Units } from '../types/project';
import { mmToDisplay, roundForDisplay, unitLabel } from '../state/units';

export interface CaliperMeasurement {
  p1: [number, number, number];
  p2: [number, number, number];
  distanceMm: number;
  dxMm: number;
  dyMm: number;
  dzMm: number;
}

interface CaliperToolProps {
  active: boolean;
  onToggleActive: (active: boolean) => void;
  measurement: CaliperMeasurement | null;
  units: Units;
  onClear: () => void;
}

export function CaliperTool({
  active,
  onToggleActive,
  measurement,
  units,
  onClear,
}: CaliperToolProps) {
  return (
    <div className="caliper-tool-wrapper">
      <button
        type="button"
        className={`vtoolbar-chip ${active ? 'active' : ''}`}
        onClick={() => onToggleActive(!active)}
        title="Digital Caliper 3D Measurement Tool"
      >
        <svg className="chip-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 3h12M4 3v4M8 3v2M12 3v4M2 13h12M4 9v4M8 11v2M12 9v4" />
        </svg>
        <span>Caliper</span>
      </button>

      {active && measurement && (
        <div className="caliper-readout-card">
          <div className="caliper-header">
            <span className="caliper-title">3D Caliper Readout</span>
            <button type="button" className="btn-icon-subtle" onClick={onClear} title="Clear measurement">
              <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>

          <div className="caliper-main-val">
            {roundForDisplay(mmToDisplay(measurement.distanceMm, units), units)} {unitLabel(units)}
          </div>

          <div className="caliper-deltas">
            <span>ΔX: {roundForDisplay(mmToDisplay(measurement.dxMm, units), units)}</span>
            <span>ΔY: {roundForDisplay(mmToDisplay(measurement.dyMm, units), units)}</span>
            <span>ΔZ: {roundForDisplay(mmToDisplay(measurement.dzMm, units), units)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
