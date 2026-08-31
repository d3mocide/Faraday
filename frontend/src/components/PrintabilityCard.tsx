import { calculatePrintabilityStats } from '../state/printability';
import { MANUFACTURING_PROFILES } from '../state/manufacturingProfiles';
import { useProjectStore } from '../state/projectStore';
import type { ManufacturingProfileId } from '../types/project';

export function PrintabilityCard() {
  const project = useProjectStore((s) => s.project);
  const setManufacturingProfile = useProjectStore((s) => s.setManufacturingProfile);
  const stats = calculatePrintabilityStats(project);

  return (
    <div className="printability-card">
      <label className="field">
        <span>Print profile</span>
        <select
          value={project.manufacturingProfile ?? 'fdm-legacy-0.4'}
          onChange={(event) => setManufacturingProfile(event.target.value as ManufacturingProfileId)}
        >
          {MANUFACTURING_PROFILES.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
      </label>
      <p className="field-hint">
        {stats.profile.calibrated ? 'Calibrated profile.' : 'Starting profile — calibrate fit before a production print.'}{' '}
        {stats.profile.targetPerimeters} target perimeters at {stats.profile.lineWidth.toFixed(2)}mm line width;{' '}
        {stats.profile.minSkin.toFixed(2)}mm minimum skin/web.
      </p>
      <div className="printability-grid">
        <div className="stat-row">
          <span className="stat-label">Filament Weight</span>
          <span className="stat-value">{stats.estimatedWeightGrams} g</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Shell Volume</span>
          <span className="stat-value">{stats.shellVolumeCm3} cm³</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Est. Print Time</span>
          <span className="stat-value">~{stats.estimatedPrintTimeHours} hrs</span>
        </div>
      </div>

      {stats.fastenersBom.length > 0 && (
        <div className="bom-section">
          <div className="bom-title">Hardware Fastener List</div>
          <div className="bom-list">
            {stats.fastenersBom.map((item, idx) => (
              <div key={idx} className="bom-item">
                <span>{item.name}</span>
                <span className="bom-qty">×{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.overhangWarnings.length > 0 && (
        <div className="overhang-warnings">
          {stats.overhangWarnings.map((warn, idx) => (
            <div key={idx} className="warning-chip">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#ffaa00" strokeWidth="2">
                <path d="M8 2L1 14h14L8 2zM8 6v4M8 12h.01" />
              </svg>
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
