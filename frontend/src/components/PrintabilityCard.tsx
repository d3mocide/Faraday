import { calculatePrintabilityStats } from '../state/printability';
import { useProjectStore } from '../state/projectStore';

export function PrintabilityCard() {
  const project = useProjectStore((s) => s.project);
  const stats = calculatePrintabilityStats(project);

  return (
    <div className="printability-card">
      <div className="printability-grid">
        <div className="stat-box">
          <span className="stat-label">Filament Weight</span>
          <span className="stat-value">{stats.estimatedWeightGrams} g</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Shell Volume</span>
          <span className="stat-value">{stats.shellVolumeCm3} cm³</span>
        </div>
        <div className="stat-box">
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
