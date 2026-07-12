import { useEffect, useState } from 'react';
import './App.css';
import { AppShell } from './components/AppShell';
import { ExportModal } from './components/ExportModal';
import { FeaturePalette, type ArmedFeatureTemplate } from './components/FeaturePalette';
import { InspectorPanel } from './components/InspectorPanel';
import { Viewport3D, type BodyResizePatch, type LidView } from './components/Viewport3D';
import { useLiveGeometry } from './csg/useLiveGeometry';
import { buildFeatureFromTemplate } from './state/featureFactory';
import { useAutosave } from './state/useAutosave';
import { useProjectStore } from './state/projectStore';
import type { Face } from './types/project';

const LID_VIEW_LABELS: Record<LidView, string> = {
  assembled: 'Assembled',
  ghost: 'Ghost',
  hidden: 'Hidden',
  exploded: 'Exploded',
};

function App() {
  const project = useProjectStore((s) => s.project);
  const addFeature = useProjectStore((s) => s.addFeature);
  const updateFeature = useProjectStore((s) => s.updateFeature);
  const removeFeature = useProjectStore((s) => s.removeFeature);
  const setBodyDimension = useProjectStore((s) => s.setBodyDimension);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const { meshes, error, isGenerating, client } = useLiveGeometry(project);
  const [exportOpen, setExportOpen] = useState(false);
  const [armed, setArmed] = useState<ArmedFeatureTemplate | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  // View-only lid presentation -- deliberately not in the project store, so it never dirties
  // undo history, autosave, or saved project files.
  const [lidView, setLidView] = useState<LidView>('assembled');

  useAutosave(project);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const isFormField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (isFormField || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handlePlaceFeature = (face: Face, u: number, v: number) => {
    if (!armed) return;
    // Standoffs and board mounts always sit on the base floor -- ignore clicks elsewhere rather
    // than reinterpret (u,v) from the wrong face, which would misplace them.
    if ((armed.type === 'standoff' || armed.type === 'board-mount') && face !== 'bottom') return;
    addFeature(buildFeatureFromTemplate(armed, face, u, v, project));
    setArmed(null);
  };

  const handleResizeBody = (patch: BodyResizePatch) => {
    if (patch.length !== undefined) setBodyDimension('length', patch.length);
    if (patch.width !== undefined) setBodyDimension('width', patch.width);
    if (patch.height !== undefined) setBodyDimension('height', patch.height);
    if (patch.diameter !== undefined) setBodyDimension('diameter', patch.diameter);
  };

  const handleRemoveFeature = (id: string) => {
    removeFeature(id);
    if (selectedFeatureId === id) setSelectedFeatureId(null);
  };

  return (
    <AppShell onExport={() => setExportOpen(true)} isGenerating={isGenerating}>
      <FeaturePalette armed={armed} onArm={setArmed} onDisarm={() => setArmed(null)} />
      <div className="viewport-area">
        <Viewport3D
          meshes={meshes}
          body={project.body}
          features={project.features}
          lidView={lidView}
          placementArmed={armed !== null}
          onPlaceFeature={handlePlaceFeature}
          selectedFeatureId={selectedFeatureId}
          onSelectFeature={setSelectedFeatureId}
          onUpdateFeature={updateFeature}
          onResizeBody={handleResizeBody}
        />
        <div className="viewport-toolbar" role="group" aria-label="Lid view">
          <span>Lid</span>
          {(Object.keys(LID_VIEW_LABELS) as LidView[]).map((view) => (
            <button
              key={view}
              type="button"
              className={lidView === view ? 'active' : ''}
              onClick={() => setLidView(view)}
            >
              {LID_VIEW_LABELS[view]}
            </button>
          ))}
        </div>
        {error && <div className="viewport-error">{error}</div>}
      </div>
      <InspectorPanel
        selectedFeatureId={selectedFeatureId}
        onSelectFeature={setSelectedFeatureId}
        onUpdateFeature={updateFeature}
        onRemoveFeature={handleRemoveFeature}
      />
      {exportOpen && client && (
        <ExportModal client={client} project={project} onClose={() => setExportOpen(false)} />
      )}
    </AppShell>
  );
}

export default App;
