import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { BoardPresetPicker } from './BoardPresetPicker';
import { exportProjectJson, parseProjectJsonFile } from '../export/projectJson';
import { useProjectStore } from '../state/projectStore';

import type { LidView } from './Viewport3D';

interface AppShellProps {
  onExport: () => void;
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

export function FaradayLogo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="faraday-logo-svg"
    >
      <defs>
        <linearGradient id="topFace" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id="leftFace" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
        <linearGradient id="rightFace" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>

      {/* 3D Isometric Enclosure facets */}
      <polygon points="16,3 28,10 16,17 4,10" fill="url(#topFace)" />
      <polygon points="4,10 16,17 16,29 4,22" fill="url(#leftFace)" />
      <polygon points="16,17 28,10 28,22 16,29" fill="url(#rightFace)" />

      {/* Inner Faraday Cage grid lines */}
      <line x1="10" y1="6.5" x2="22" y2="13.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
      <line x1="22" y1="6.5" x2="10" y2="13.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
      <line x1="10" y1="13.5" x2="10" y2="25.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      <line x1="22" y1="13.5" x2="22" y2="25.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />

      {/* Central Electromagnetic Flux Core */}
      <polygon
        points="17.5,7.5 11.5,16 15,16 14,24.5 20.5,15 17,15"
        fill="#ffffff"
        stroke="#0284c7"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppShell({
  onExport,
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
        <div className="topbar-actions-left">
          <div className="topbar-brand">
            <FaradayLogo size={22} />
            <span className="app-title">Faraday</span>
          </div>
          <div className="project-name-wrapper" title="Click to rename enclosure project">
            <input
              className="project-name-input"
              value={project.name}
              onChange={handleNameChange}
              aria-label="Project name"
            />
            <svg className="edit-pencil-icon" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 2l3 3-9 9H2v-3l9-9z" />
            </svg>
          </div>
          <button type="button" onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button type="button" onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
          <div className="units-toggle" title="Toggle Display Units (mm / in)">
            <button
              type="button"
              className={`units-btn ${project.units === 'mm' ? 'active' : ''}`}
              onClick={() => setUnits('mm')}
            >
              mm
            </button>
            <button
              type="button"
              className={`units-btn ${project.units === 'in' ? 'active' : ''}`}
              onClick={() => setUnits('in')}
            >
              in
            </button>
          </div>
          <button type="button" onClick={() => setPresetsOpen(true)} title="Browse Board & Project Presets">
            Presets
          </button>
          <button type="button" onClick={() => exportProjectJson(project)} title="Save Project JSON to Disk">
            Save
          </button>
          <button type="button" onClick={handleLoadClick} title="Open Project JSON">
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
            <div className="vtoolbar-segmented" title="Lid Presentation Modes">
              {(['assembled', 'ghost', 'hidden', 'exploded'] as const).map((view, idx) => (
                <button
                  key={view}
                  type="button"
                  className={`vtoolbar-btn ${lidView === view ? 'active' : ''}`}
                  onClick={() => onSetLidView(view)}
                  title={`View: ${view.charAt(0).toUpperCase() + view.slice(1)} (Key ${idx + 1})`}
                >
                  <span>{view.charAt(0).toUpperCase() + view.slice(1)}</span>
                </button>
              ))}
            </div>

            <div className="vtoolbar-divider" />

            <button
              type="button"
              className={`vtoolbar-chip ${showEdgeLines ? 'active' : ''}`}
              onClick={() => onToggleShowEdgeLines(!showEdgeLines)}
              title="Toggle CAD Edge Outlines (O)"
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
              title="Toggle Viewport Grid (G)"
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
              title="Toggle 3D Dimension Handles (H)"
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
              title="Toggle 3D Feature Placement Markers"
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
