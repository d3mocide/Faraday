import type { ChangeEvent } from 'react';
import { findConnector } from '../connectors/library';
import { useProjectStore } from '../state/projectStore';
import type {
  CornerStyleType,
  Feature,
  LidType,
  ScrewCount,
  ScrewInsertType,
  ScrewSize,
} from '../types/project';

function featureLabel(feature: Feature): string {
  if (feature.type === 'standoff') return 'Standoff';
  if (feature.type === 'connector-cutout' && feature.connectorId) {
    return findConnector(feature.connectorId)?.label ?? feature.connectorId;
  }
  return feature.type;
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.valueAsNumber;
    if (!Number.isNaN(next)) onChange(next);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} onChange={handleChange} />
    </label>
  );
}

interface InspectorPanelProps {
  selectedFeatureId: string | null;
  onSelectFeature: (id: string | null) => void;
  onUpdateFeature: (id: string, patch: Partial<Feature>) => void;
  onRemoveFeature: (id: string) => void;
}

export function InspectorPanel({
  selectedFeatureId,
  onSelectFeature,
  onUpdateFeature,
  onRemoveFeature,
}: InspectorPanelProps) {
  const project = useProjectStore((s) => s.project);
  const setBodyDimension = useProjectStore((s) => s.setBodyDimension);
  const setWallThickness = useProjectStore((s) => s.setWallThickness);
  const setCornerStyleType = useProjectStore((s) => s.setCornerStyleType);
  const setCornerRadius = useProjectStore((s) => s.setCornerRadius);
  const setLidType = useProjectStore((s) => s.setLidType);
  const setSplitHeight = useProjectStore((s) => s.setSplitHeight);
  const setWallGap = useProjectStore((s) => s.setWallGap);
  const setScrewSize = useProjectStore((s) => s.setScrewSize);
  const setScrewInsertType = useProjectStore((s) => s.setScrewInsertType);
  const setScrewCount = useProjectStore((s) => s.setScrewCount);

  const { body } = project;
  const { outer, cornerStyle, lid } = body;
  const selectedFeature = project.features.find((f) => f.id === selectedFeatureId) ?? null;

  return (
    <div className="inspector-panel">
      <section>
        <h3>Body</h3>
        <NumberField
          label="Length"
          value={outer.length}
          min={5}
          onChange={(v) => setBodyDimension('length', v)}
        />
        <NumberField
          label="Width"
          value={outer.width}
          min={5}
          onChange={(v) => setBodyDimension('width', v)}
        />
        <NumberField
          label="Height"
          value={outer.height}
          min={5}
          onChange={(v) => setBodyDimension('height', v)}
        />
        <NumberField
          label="Wall thickness"
          value={body.wallThickness}
          min={0.8}
          max={Math.min(outer.length, outer.width) / 2 - 0.5}
          onChange={setWallThickness}
        />
      </section>

      <section>
        <h3>Corners</h3>
        <label className="field">
          <span>Style</span>
          <select
            value={cornerStyle.type}
            onChange={(e) => setCornerStyleType(e.target.value as CornerStyleType)}
          >
            <option value="sharp">Sharp</option>
            <option value="rounded">Rounded</option>
            <option value="chamfered">Chamfered</option>
          </select>
        </label>
        {cornerStyle.type !== 'sharp' && (
          <NumberField
            label="Corner radius"
            value={cornerStyle.radius}
            min={0.5}
            max={Math.min(outer.length, outer.width) / 2 - 0.5}
            onChange={setCornerRadius}
          />
        )}
      </section>

      <section>
        <h3>Lid</h3>
        <label className="field">
          <span>Type</span>
          <select value={lid.type} onChange={(e) => setLidType(e.target.value as LidType)}>
            <option value="friction-lip">Friction lip</option>
            <option value="screw-boss">Screw boss</option>
          </select>
        </label>
        <NumberField
          label="Split height"
          value={lid.splitHeight}
          min={body.wallThickness + 1}
          max={outer.height - body.wallThickness - 1}
          onChange={setSplitHeight}
        />
        <NumberField
          label="Wall gap (fit clearance)"
          value={lid.wallGap}
          min={0}
          max={1}
          step={0.05}
          onChange={setWallGap}
        />

        {lid.type === 'screw-boss' && lid.screw && (
          <>
            <label className="field">
              <span>Screw size</span>
              <select
                value={lid.screw.size}
                onChange={(e) => setScrewSize(e.target.value as ScrewSize)}
              >
                <option value="M2">M2</option>
                <option value="M2.5">M2.5</option>
                <option value="M3">M3</option>
              </select>
            </label>
            <label className="field">
              <span>Insert type</span>
              <select
                value={lid.screw.insertType}
                onChange={(e) => setScrewInsertType(e.target.value as ScrewInsertType)}
              >
                <option value="heat-set">Heat-set</option>
                <option value="self-tap">Self-tap</option>
              </select>
            </label>
            <label className="field">
              <span>Boss count</span>
              <select
                value={lid.screw.count}
                onChange={(e) => setScrewCount(Number(e.target.value) as ScrewCount)}
              >
                <option value={4}>4</option>
                <option value={6}>6</option>
                <option value={8}>8</option>
              </select>
            </label>
          </>
        )}
      </section>

      <section>
        <h3>Features</h3>
        {project.features.length === 0 ? (
          <p className="feature-list-empty">None placed yet — pick one from the palette, then click a face.</p>
        ) : (
          <ul className="feature-list">
            {project.features.map((feature) => (
              <li key={feature.id} className={feature.id === selectedFeatureId ? 'selected' : undefined}>
                <button type="button" className="feature-list-select" onClick={() => onSelectFeature(feature.id)}>
                  {featureLabel(feature)} <em>({feature.face})</em>
                </button>
                <button type="button" onClick={() => onRemoveFeature(feature.id)} aria-label={`Remove ${featureLabel(feature)}`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedFeature && (
        <section>
          <h3>Selected: {featureLabel(selectedFeature)}</h3>
          <NumberField
            label="Rotation (deg)"
            value={selectedFeature.rotationDeg}
            step={5}
            onChange={(v) => onUpdateFeature(selectedFeature.id, { rotationDeg: v })}
          />
          {selectedFeature.type === 'standoff' && selectedFeature.standoff && (
            <>
              <NumberField
                label="Outer diameter"
                value={selectedFeature.standoff.outerDiameter}
                min={2}
                onChange={(v) =>
                  onUpdateFeature(selectedFeature.id, {
                    standoff: { ...selectedFeature.standoff!, outerDiameter: v },
                  })
                }
              />
              <NumberField
                label="Screw hole diameter"
                value={selectedFeature.standoff.screwHoleDiameter}
                min={0.5}
                onChange={(v) =>
                  onUpdateFeature(selectedFeature.id, {
                    standoff: { ...selectedFeature.standoff!, screwHoleDiameter: v },
                  })
                }
              />
              <NumberField
                label="Height"
                value={selectedFeature.standoff.height}
                min={1}
                onChange={(v) =>
                  onUpdateFeature(selectedFeature.id, {
                    standoff: { ...selectedFeature.standoff!, height: v },
                  })
                }
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}
