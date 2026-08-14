import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { AppShell } from './components/AppShell';
import { ExportModal } from './components/ExportModal';
import { FeaturePalette, type ArmedFeatureTemplate } from './components/FeaturePalette';
import { InspectorPanel } from './components/InspectorPanel';
import { Viewport3D, type BodyResizePatch, type LidView, type PreviewTarget } from './components/Viewport3D';
import { useLiveGeometry } from './csg/useLiveGeometry';
import { buildFeatureFromTemplate } from './state/featureFactory';
import { runDesignChecks } from './state/designChecks';
import { useAutosave } from './state/useAutosave';
import { useProjectStore } from './state/projectStore';
import { BlueprintModal } from './components/BlueprintModal';
import { CommandPalette } from './components/CommandPalette';
import { CaliperTool, type CaliperMeasurement } from './components/CaliperTool';
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

  const [lidView, setLidView] = useState<LidView>('assembled');
  const [showHandles, setShowHandles] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showGhosts, setShowGhosts] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showEdgeLines, setShowEdgeLines] = useState(true);
  const [shadingMode, setShadingMode] = useState<'smooth' | 'flat'>('smooth');
  const [materialPreset, setMaterialPreset] = useState<'default' | 'tactical-black' | 'gunmetal' | 'olive-drab' | 'radio-orange'>('default');
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);

  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [caliperActive, setCaliperActive] = useState(false);
  const [caliperMeasurement, setCaliperMeasurement] = useState<CaliperMeasurement | null>(null);

  // Advisory design checks (state/designChecks.ts)
  const findings = useMemo(() => runDesignChecks(project), [project]);
  const flaggedFeatureIds = useMemo(
    () => new Set(findings.flatMap((f) => (f.featureId ? [f.featureId] : []))),
    [findings],
  );

  useAutosave(project);

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
      if (isFormField) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
        return;
      }

      if (e.altKey) return;

      if (e.key === '1') {
        setLidView('assembled');
      } else if (e.key === '2') {
        setLidView('ghost');
      } else if (e.key === '3') {
        setLidView('hidden');
      } else if (e.key === '4') {
        setLidView('exploded');
      } else if (e.key.toLowerCase() === 'o') {
        setShowEdgeLines((v) => !v);
      } else if (e.key.toLowerCase() === 'g') {
        setShowGrid((v) => !v);
      } else if (e.key.toLowerCase() === 'h') {
        setShowHandles((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handlePlaceFeature = (face: Face, u: number, v: number) => {
    if (!armed) return;
    if (
      (armed.type === 'standoff' || armed.type === 'board-mount' || armed.type === 'support-pad') &&
      face !== 'bottom'
    ) {
      return;
    }
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
    <AppShell
      onExport={() => setExportOpen(true)}
      lidView={lidView}
      onSetLidView={setLidView}
      showHandles={showHandles}
      onToggleShowHandles={setShowHandles}
      showGrid={showGrid}
      onToggleShowGrid={setShowGrid}
      showGhosts={showGhosts}
      onToggleShowGhosts={setShowGhosts}
      showMarkers={showMarkers}
      onToggleShowMarkers={setShowMarkers}
      showEdgeLines={showEdgeLines}
      onToggleShowEdgeLines={setShowEdgeLines}
      onOpenCommandPalette={() => setCommandPaletteOpen(true)}
    >
      <FeaturePalette armed={armed} onArm={setArmed} onDisarm={() => setArmed(null)} />
      <div className="viewport-area">
        <div className="viewport-floating-tools">
          {isGenerating && (
            <div className="generating-indicator-chip" role="status" aria-live="polite">
              <span className="generating-spinner" />
              <span>Regenerating...</span>
            </div>
          )}
          <button
            type="button"
            className="vtoolbar-chip"
            onClick={() => setBlueprintOpen(true)}
            title="Open 2D Face Blueprint Canvas"
          >
            <svg className="chip-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="12" height="12" rx="1.5" />
              <path d="M2 6h12M6 2v12" />
            </svg>
            <span>2D Blueprint</span>
          </button>
          <CaliperTool
            active={caliperActive}
            onToggleActive={setCaliperActive}
            measurement={caliperMeasurement}
            units={project.units}
            onClear={() => setCaliperMeasurement(null)}
          />
        </div>
        <Viewport3D
          meshes={meshes}
          body={project.body}
          features={project.features}
          lidView={lidView}
          showHandles={showHandles}
          showGrid={showGrid}
          showGhosts={showGhosts}
          showMarkers={showMarkers}
          showEdgeLines={showEdgeLines}
          shadingMode={shadingMode}
          materialPreset={materialPreset}
          placementArmed={armed !== null}
          onPlaceFeature={handlePlaceFeature}
          selectedFeatureId={selectedFeatureId}
          onSelectFeature={setSelectedFeatureId}
          onUpdateFeature={updateFeature}
          onResizeBody={handleResizeBody}
          previewTarget={previewTarget}
          flaggedFeatureIds={flaggedFeatureIds}
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
        findings={findings}
        shadingMode={shadingMode}
        onChangeShadingMode={setShadingMode}
        materialPreset={materialPreset}
        onChangeMaterialPreset={setMaterialPreset}
        onSelectFeature={setSelectedFeatureId}
        onUpdateFeature={updateFeature}
        onRemoveFeature={handleRemoveFeature}
        onAddFeature={addFeature}
        onPreviewTarget={setPreviewTarget}
      />
      {exportOpen && client && <ExportModal client={client} project={project} onClose={() => setExportOpen(false)} />}
      {blueprintOpen && (
        <BlueprintModal
          selectedFeatureId={selectedFeatureId}
          onSelectFeature={setSelectedFeatureId}
          onClose={() => setBlueprintOpen(false)}
        />
      )}
      {commandPaletteOpen && (
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onArmFeature={setArmed}
        />
      )}
    </AppShell>
  );
}

export default App;
