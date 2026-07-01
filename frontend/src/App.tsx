import { useState } from 'react';
import './App.css';
import { AppShell } from './components/AppShell';
import { ExportModal } from './components/ExportModal';
import { InspectorPanel } from './components/InspectorPanel';
import { Viewport3D } from './components/Viewport3D';
import { useLiveGeometry } from './csg/useLiveGeometry';
import { useProjectStore } from './state/projectStore';

function App() {
  const project = useProjectStore((s) => s.project);
  const { meshes, error, isGenerating, client } = useLiveGeometry(project);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <AppShell onExport={() => setExportOpen(true)} isGenerating={isGenerating}>
      <div className="viewport-area">
        <Viewport3D meshes={meshes} />
        {error && <div className="viewport-error">{error}</div>}
      </div>
      <InspectorPanel />
      {exportOpen && client && (
        <ExportModal client={client} project={project} onClose={() => setExportOpen(false)} />
      )}
    </AppShell>
  );
}

export default App;
