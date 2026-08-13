import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { BoardPresetPicker } from './BoardPresetPicker';
import { exportProjectJson, parseProjectJsonFile } from '../export/projectJson';
import { useProjectStore } from '../state/projectStore';
import type { Units } from '../types/project';

import type { LidView } from './Viewport3D';

interface AppShellProps {
  onExport: () => void;
  isGenerating: boolean;
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
  onOpenCommandPalette?: () => void;
  children: ReactNode;
}

export function AppShell({
  onExport,
  isGenerating,
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
  onOpenCommandPalette,
  children,
}: AppShellProps) {
  const project = useProjectStore((s) => s.project);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const setUnits = useProjectStore((s) => s.setUnits);
  const loadProject = useProjectStore((s) => s.loadProject);
  const past = useProjectStore((s) => s.past);
  const future = useProjectStore((s) => s.future);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  const [presetsOpen, setPresetsOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setProjectName(e.target.value);
  };

  const handleLoadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;
    try {
      const loaded = await parseProjectJsonFile(file);
      loadProject(loaded);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load that file.');
    }
  };

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <span className="app-title">Faraday</span>
        <input
          className="project-name-input"
          value={project.name}
          onChange={handleNameChange}
          aria-label="Project name"
        />
        <div className="topbar-actions-left">
          <button type="button" onClick={undo} disabled={past.length === 0} title="Undo">
            Undo
          </button>
          <button type="button" onClick={redo} disabled={future.length === 0} title="Redo">
            Redo
          </button>
          <select
            className="units-select"
            value={project.units}
            onChange={(e) => setUnits(e.target.value as Units)}
            aria-label="Units"
          >
            <option value="mm">mm</option>
            <option value="in">in</option>
          </select>
          <button type="button" onClick={() => setPresetsOpen(true)}>
            Presets
          </button>
          <button type="button" onClick={() => exportProjectJson(project)}>
            Save
          </button>
          <button type="button" onClick={handleLoadClick}>
            Load
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="visually-hidden"
            onChange={(e) => void handleFileChange(e)}
          />
        </div>

        {/* Viewport Display Controls integrated cleanly into top taskbar */}
        <div className="topbar-vtoolbar">
          <div className="vtoolbar-chips">
            {(['assembled', 'ghost', 'hidden', 'exploded'] as const).map((view) => (
              <button
                key={view}
                type="button"
                className={`vtoolbar-chip ${lidView === view ? 'active' : ''}`}
                onClick={() => onSetLidView(view)}
              >
                <span>{view.charAt(0).toUpperCase() + view.slice(1)}</span>
              </button>
            ))}

            <div className="vtoolbar-divider" />

            <button
              type="button"
              className={`vtoolbar-chip ${showEdgeLines ? 'active' : ''}`}
              onClick={() => onToggleShowEdgeLines(!showEdgeLines)}
              title="Toggle CAD Edge Outlines"
            >
              <svg className="chip-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <path d="M2 6h12M6 2v12" />
              </svg>
              <span>Outlines</span>
            </button>

            <button
              type="button"
              className={`vtoolbar-chip ${showGrid ? 'active' : ''}`}
              onClick={() => onToggleShowGrid(!showGrid)}
              title="Toggle Viewport Grid"
            >
              <svg className="chip-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 4h12M2 8h12M2 12h12M4 2v12M8 2v12M12 2v12" />
              </svg>
              <span>Grid</span>
            </button>
            <button
              type="button"
              className={`vtoolbar-chip ${showHandles ? 'active' : ''}`}
              onClick={() => onToggleShowHandles(!showHandles)}
              title="Toggle 3D Dimension Handles"
            >
              <svg className="chip-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="5" />
                <path d="M8 1v4M8 11v4M1 8h4M11 8h4" />
              </svg>
              <span>Handles</span>
            </button>
            <button
              type="button"
              className={`vtoolbar-chip ${showGhosts ? 'active' : ''}`}
              onClick={() => onToggleShowGhosts(!showGhosts)}
              title="Toggle Translucent Ghost Parts"
            >
              <svg className="chip-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 2a5 5 0 00-5 5v7l2.5-1.5L8 14l2.5-1.5L13 14V7a5 5 0 00-5-5z" />
                <circle cx="6" cy="6.5" r="1" fill="currentColor" />
                <circle cx="10" cy="6.5" r="1" fill="currentColor" />
              </svg>
              <span>Ghosts</span>
            </button>
            <button
              type="button"
              className={`vtoolbar-chip ${showMarkers ? 'active' : ''}`}
              onClick={() => onToggleShowMarkers(!showMarkers)}
              title="Toggle 3D Feature Markers"
            >
              <svg className="chip-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 2a4 4 0 00-4 4c0 3.5 4 8 4 8s4-4.5 4-8a4 4 0 00-4-4z" />
                <circle cx="8" cy="6" r="1.5" fill="currentColor" />
              </svg>
              <span>Markers</span>
            </button>
          </div>
        </div>

        <div className="topbar-actions-right">
          {onOpenCommandPalette && (
            <button
              type="button"
              className="btn-cmd-palette-chip"
              onClick={onOpenCommandPalette}
              title="Quick Command Palette (Ctrl+K)"
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="6.5" cy="6.5" r="4.5" />
                <path d="M10 10l4 4" />
              </svg>
              <span>Ctrl+K</span>
            </button>
          )}
          <span className="generation-status" aria-live="polite">
            {isGenerating ? 'Regenerating...' : ''}
          </span>
          <button type="button" className="btn-export-primary" onClick={onExport}>
            Export
          </button>
        </div>
      </header>
      {loadError && (
        <div className="load-error" role="alert">
          {loadError}
          <button type="button" onClick={() => setLoadError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <main className="app-main">{children}</main>
      {presetsOpen && <BoardPresetPicker onClose={() => setPresetsOpen(false)} />}
    </div>
  );
}
