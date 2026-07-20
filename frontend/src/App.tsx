import { useEffect, useState } from 'react';
import './App.css';
import { AppShell } from './components/AppShell';
import { ExportModal } from './components/ExportModal';
import { FeaturePalette, type ArmedFeatureTemplate } from './components/FeaturePalette';
import { InspectorPanel } from './components/InspectorPanel';
import { Viewport3D, type BodyResizePatch, type LidView, type PreviewTarget } from './components/Viewport3D';
import { useLiveGeometry } from './csg/useLiveGeometry';
import { buildFeatureFromTemplate } from './state/featureFactory';
import { useAutosave } from './state/useAutosave';
import { useProjectStore } from './state/projectStore';
import type { Face } from './types/project';

function App() {
  const project = useProjectStore((s) => s.project);
  const addFeature = useProjectStore((s) => s.addFeature);
  const updateFeature = useProjectStore((s) => s.updateFeature);
  const removeFeature = useProjectStore((s) => s.removeFeature);
  const setBodyDimension = useProjectStore((s) => s.setBodyDimension);
  const setSplitHeight = useProjectStore((s) => s.setSplitHeight);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const { meshes, error, isGenerating, client } = useLiveGeometry(project);
  const [exportOpen, setExportOpen] = useState(false);
  const [armed, setArmed] = useState<ArmedFeatureTemplate | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  // View-only lid presentation -- deliberately not in the project store, so it never dirties
  // undo history, autosave, or saved project files.
  const [lidView, setLidView] = useState<LidView>('assembled');
  const [showHandles, setShowHandles] = useState(true);
  // Align/mirror hover-preview target (see AlignMirrorAxisRow in InspectorPanel.tsx) -- also
  // view-only, same non-persisted precedent as lidView.
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);

  useAutosave(project);

  // A stale preview can otherwise linger if the selected feature changes (or gets deselected)
  // while a button is still focused/hovered -- e.g. clicking a different marker in the viewport
  // doesn't fire the align button's onMouseLeave.
  useEffect(() => {
    setPreviewTarget(null);
  }, [selectedFeatureId]);

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
    if (patch.splitHeight !== undefined) setSplitHeight(patch.splitHeight);
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
          showHandles={showHandles}
          placementArmed={armed !== null}
          onPlaceFeature={handlePlaceFeature}
          selectedFeatureId={selectedFeatureId}
          onSelectFeature={setSelectedFeatureId}
          onUpdateFeature={updateFeature}
          onResizeBody={handleResizeBody}
          previewTarget={previewTarget}
        />
        {error && (
          <div className="viewport-error" role="alert">
            <span className="viewport-error-text">
              {error} The view still shows your last valid shape.
            </span>
            {canUndo && (
              <button type="button" onClick={undo} className="viewport-error-undo">
                Undo last change
              </button>
            )}
          </div>
        )}
      </div>
      <InspectorPanel
        selectedFeatureId={selectedFeatureId}
        lidView={lidView}
        onSetLidView={setLidView}
        showHandles={showHandles}
        onToggleShowHandles={setShowHandles}
        onSelectFeature={setSelectedFeatureId}
        onUpdateFeature={updateFeature}
        onRemoveFeature={handleRemoveFeature}
        onAddFeature={addFeature}
        onPreviewTarget={setPreviewTarget}
      />
      {exportOpen && client && (
        <ExportModal client={client} project={project} onClose={() => setExportOpen(false)} />
      )}
    </AppShell>
  );
}

export default App;
