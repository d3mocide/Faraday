import type { ChangeEvent, ReactNode } from 'react';
import { useProjectStore } from '../state/projectStore';

interface AppShellProps {
  onExport: () => void;
  isGenerating: boolean;
  children: ReactNode;
}

export function AppShell({ onExport, isGenerating, children }: AppShellProps) {
  const name = useProjectStore((s) => s.project.name);
  const setProjectName = useProjectStore((s) => s.setProjectName);

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setProjectName(e.target.value);
  };

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <span className="app-title">Faraday</span>
        <input
          className="project-name-input"
          value={name}
          onChange={handleNameChange}
          aria-label="Project name"
        />
        <span className="generation-status" aria-live="polite">
          {isGenerating ? 'Regenerating...' : ''}
        </span>
        <button type="button" onClick={onExport}>
          Export
        </button>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
