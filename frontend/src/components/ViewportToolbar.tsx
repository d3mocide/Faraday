import type { LidView } from './Viewport3D';

interface ViewportToolbarProps {
  lidView: LidView;
  onSetLidView: (view: LidView) => void;
  showHandles: boolean;
  onToggleShowHandles: (show: boolean) => void;
  showGrid: boolean;
  onToggleShowGrid: (show: boolean) => void;
  showGhosts: boolean;
  onToggleShowGhosts: (show: boolean) => void;
  showMarkers: boolean;
  onToggleShowMarkers: (show: boolean) => void;
  showEdgeLines: boolean;
  onToggleShowEdgeLines: (show: boolean) => void;
}

export function ViewportToolbar({
  lidView,
  onSetLidView,
  showHandles,
  onToggleShowHandles,
  showGrid,
  onToggleShowGrid,
  showGhosts,
  onToggleShowGhosts,
  showMarkers,
  onToggleShowMarkers,
  showEdgeLines,
  onToggleShowEdgeLines,
}: ViewportToolbarProps) {
  return (
    <div className="viewport-floating-toolbar" role="toolbar" aria-label="3D Viewport Controls">
      {/* Lid Presentation Mode Segmented Group */}
      <div className="vtoolbar-group lid-modes">
        <span className="vtoolbar-label">Lid Mode</span>
        <div className="vtoolbar-segmented">
          {(['assembled', 'ghost', 'hidden', 'exploded'] as LidView[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`vtoolbar-btn ${lidView === mode ? 'active' : ''}`}
              onClick={() => onSetLidView(mode)}
              title={`Switch lid presentation to ${mode}`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="vtoolbar-divider" />

      {/* Viewport Display Toggles */}
      <div className="vtoolbar-group display-toggles">
        <button
          type="button"
          className={`vtoolbar-chip ${showEdgeLines ? 'active' : ''}`}
          onClick={() => onToggleShowEdgeLines(!showEdgeLines)}
          title="Toggle CAD Edge Outlines"
        >
          <svg className="chip-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="2,14 14,14 14,2" strokeLinejoin="round" />
            <line x1="2" y1="14" x2="14" y2="2" />
          </svg>
          <span>Outlines</span>
        </button>

        <button
          type="button"
          className={`vtoolbar-chip ${showGrid ? 'active' : ''}`}
          onClick={() => onToggleShowGrid(!showGrid)}
          title="Toggle Grid & Floor Axes"
        >
          <svg className="chip-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="2" y1="8" x2="14" y2="8" />
            <line x1="8" y1="2" x2="8" y2="14" />
            <circle cx="8" cy="8" r="6" />
          </svg>
          <span>Grid</span>
        </button>

        <button
          type="button"
          className={`vtoolbar-chip ${showHandles ? 'active' : ''}`}
          onClick={() => onToggleShowHandles(!showHandles)}
          title="Toggle 3D Resize Handles"
        >
          <svg className="chip-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="12" height="12" rx="2" strokeDasharray="2 2" />
            <circle cx="2" cy="2" r="1.5" fill="currentColor" />
            <circle cx="14" cy="2" r="1.5" fill="currentColor" />
            <circle cx="2" cy="14" r="1.5" fill="currentColor" />
            <circle cx="14" cy="14" r="1.5" fill="currentColor" />
          </svg>
          <span>Handles</span>
        </button>

        <button
          type="button"
          className={`vtoolbar-chip ${showGhosts ? 'active' : ''}`}
          onClick={() => onToggleShowGhosts(!showGhosts)}
          title="Toggle Ghost Hardware (PCBs & Fans)"
        >
          <svg className="chip-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 14V7a4 4 0 018 0v7l-2-1.5-2 1.5-2-1.5L4 14z" />
            <circle cx="6.5" cy="7" r="1" fill="currentColor" />
            <circle cx="9.5" cy="7" r="1" fill="currentColor" />
          </svg>
          <span>Ghosts</span>
        </button>

        <button
          type="button"
          className={`vtoolbar-chip ${showMarkers ? 'active' : ''}`}
          onClick={() => onToggleShowMarkers(!showMarkers)}
          title="Toggle Feature Placement Markers"
        >
          <svg className="chip-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 2a4 4 0 00-4 4c0 3.5 4 8 4 8s4-4.5 4-8a4 4 0 00-4-4z" />
            <circle cx="8" cy="6" r="1.5" fill="currentColor" />
          </svg>
          <span>Markers</span>
        </button>
      </div>
    </div>
  );
}
