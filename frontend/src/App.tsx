import { useState } from 'react';
import './App.css';
import { AppShell } from './components/AppShell';
import { ExportModal } from './components/ExportModal';
import { FeaturePalette, type ArmedFeatureTemplate } from './components/FeaturePalette';
import { InspectorPanel } from './components/InspectorPanel';
import { Viewport3D } from './components/Viewport3D';
import { useLiveGeometry } from './csg/useLiveGeometry';
import { buildFeatureFromTemplate } from './state/featureFactory';
import { useProjectStore } from './state/projectStore';
import type { Face } from './types/project';

function App() {
  const project = useProjectStore((s) => s.project);
  const addFeature = useProjectStore((s) => s.addFeature);
  const { meshes, error, isGenerating, client } = useLiveGeometry(project);
  const [exportOpen, setExportOpen] = useState(false);
  const [armed, setArmed] = useState<ArmedFeatureTemplate | null>(null);

  const handlePlaceFeature = (face: Face, u: number, v: number) => {
    if (!armed) return;
    // Standoffs always mount to the base floor -- ignore clicks elsewhere rather than
    // reinterpret (u,v) from the wrong face, which would misplace the boss.
    if (armed.type === 'standoff' && face !== 'bottom') return;
    addFeature(buildFeatureFromTemplate(armed, face, u, v, project));
    setArmed(null);
  };

  return (
    <AppShell onExport={() => setExportOpen(true)} isGenerating={isGenerating}>
      <FeaturePalette armed={armed} onArm={setArmed} onDisarm={() => setArmed(null)} />
      <div className="viewport-area">
        <Viewport3D
          meshes={meshes}
          outer={project.body.outer}
          features={project.features}
          placementArmed={armed !== null}
          onPlaceFeature={handlePlaceFeature}
        />
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
