import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { BoardPresetPicker } from './BoardPresetPicker';
import { exportProjectJson, parseProjectJsonFile } from '../export/projectJson';
import { useProjectStore } from '../state/projectStore';
import type { Units } from '../types/project';

interface AppShellProps {
  onExport: () => void;
  isGenerating: boolean;
  children: ReactNode;
}

export function AppShell({ onExport, isGenerating, children }: AppShellProps) {
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
        <span className="generation-status" aria-live="polite">
          {isGenerating ? 'Regenerating...' : ''}
        </span>
        <button type="button" onClick={onExport}>
          Export
        </button>
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
