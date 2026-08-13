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
          <span className="chip-icon">📐</span>
          <span>Outlines</span>
        </button>

        <button
          type="button"
          className={`vtoolbar-chip ${showGrid ? 'active' : ''}`}
          onClick={() => onToggleShowGrid(!showGrid)}
          title="Toggle Grid & Floor Axes"
        >
          <span className="chip-icon">🌐</span>
          <span>Grid</span>
        </button>

        <button
          type="button"
          className={`vtoolbar-chip ${showHandles ? 'active' : ''}`}
          onClick={() => onToggleShowHandles(!showHandles)}
          title="Toggle 3D Resize Handles"
        >
          <span className="chip-icon">🕹️</span>
          <span>Handles</span>
        </button>

        <button
          type="button"
          className={`vtoolbar-chip ${showGhosts ? 'active' : ''}`}
          onClick={() => onToggleShowGhosts(!showGhosts)}
          title="Toggle Ghost Hardware (PCBs & Fans)"
        >
          <span className="chip-icon">👻</span>
          <span>Ghosts</span>
        </button>

        <button
          type="button"
          className={`vtoolbar-chip ${showMarkers ? 'active' : ''}`}
          onClick={() => onToggleShowMarkers(!showMarkers)}
          title="Toggle Feature Placement Markers"
        >
          <span className="chip-icon">📍</span>
          <span>Markers</span>
        </button>
      </div>
    </div>
  );
}
