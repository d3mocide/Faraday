import type { ChangeEvent } from 'react';
import { findConnector } from '../connectors/library';
import { useProjectStore } from '../state/projectStore';
import { displayStep, displayToMm, mmToDisplay, roundForDisplay, unitLabel } from '../state/units';
import { cornerHolePattern } from '../state/featureFactory';
import { alignedPosition, cloneFeatureAt, mirroredPosition, type Axis, type AxisTarget } from '../state/alignMirror';
import type { PreviewTarget } from './Viewport3D';
import type {
  BoardMountSpec,
  BodyShape,
  ConnectorLibraryEntry,
  CornerStyleType,
  Feature,
  LidType,
  ScrewCount,
  ScrewInsertType,
  ScrewSize,
  Units,
  VentSpec,
} from '../types/project';

function featureLabel(feature: Feature): string {
  if (feature.type === 'standoff') return 'Standoff';
  if (feature.type === 'board-mount') return 'Board mount';
  if (feature.type === 'vent') return 'Vent';
  if (feature.type === 'custom-hole') return 'Custom hole';
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

/** NumberField for a canonical-mm value, displayed/edited in the project's current units. */
function UnitNumberField({
  label,
  valueMm,
  units,
  minMm,
  maxMm,
  stepMm = 0.1,
  onChangeMm,
}: {
  label: string;
  valueMm: number;
  units: Units;
  minMm?: number;
  maxMm?: number;
  stepMm?: number;
  onChangeMm: (mm: number) => void;
}) {
  return (
    <NumberField
      label={`${label} (${unitLabel(units)})`}
      value={roundForDisplay(mmToDisplay(valueMm, units), units)}
      min={minMm !== undefined ? mmToDisplay(minMm, units) : undefined}
      max={maxMm !== undefined ? mmToDisplay(maxMm, units) : undefined}
      step={displayStep(stepMm, units)}
      onChange={(v) => onChangeMm(displayToMm(v, units))}
    />
  );
}

/** Per-placement size override editor for a connector cutout. Values fall back to the library
 * entry, and edits write to feature.connectorOverride so the library itself stays untouched. */
function ConnectorSizeFields({
  feature,
  entry,
  units,
  onUpdateFeature,
}: {
  feature: Feature;
  entry: ConnectorLibraryEntry | undefined;
  units: Units;
  onUpdateFeature: (id: string, patch: Partial<Feature>) => void;
}) {
  if (!entry) return null;
  const override = feature.connectorOverride;
  const setOverride = (patch: NonNullable<Feature['connectorOverride']>) =>
    onUpdateFeature(feature.id, { connectorOverride: { ...override, ...patch } });

  return (
    <>
      {(entry.holeShape === 'circle' || entry.holeShape === 'dshape') && (
        <UnitNumberField
          label="Diameter"
          valueMm={override?.diameter ?? entry.diameter ?? 5}
          units={units}
          minMm={0.5}
          onChangeMm={(v) => setOverride({ diameter: v })}
        />
      )}
      {entry.holeShape === 'dshape' && (
        <UnitNumberField
          label="Across flat"
          valueMm={override?.height ?? entry.height ?? (override?.diameter ?? entry.diameter ?? 5) * 0.85}
          units={units}
          minMm={0.5}
          onChangeMm={(v) => setOverride({ height: v })}
        />
      )}
      {entry.holeShape === 'rect' && (
        <>
          <UnitNumberField
            label="Width"
            valueMm={override?.width ?? entry.width ?? 5}
            units={units}
            minMm={0.5}
            onChangeMm={(v) => setOverride({ width: v })}
          />
          <UnitNumberField
            label="Height"
            valueMm={override?.height ?? entry.height ?? 5}
            units={units}
            minMm={0.5}
            onChangeMm={(v) => setOverride({ height: v })}
          />
        </>
      )}
      {override && (
        <button type="button" onClick={() => onUpdateFeature(feature.id, { connectorOverride: undefined })}>
          Reset to library size
        </button>
      )}
    </>
  );
}

/** Board-mount editor: PCB outline, shared standoff spec, and the mounting-hole list (mm offsets
 * from the board center). The corner-pattern button regenerates the classic 4-hole layout from
 * the current outline; holes can also be edited/added/removed individually for odd boards. */
function BoardMountFields({
  feature,
  board,
  units,
  onUpdateFeature,
}: {
  feature: Feature;
  board: BoardMountSpec;
  units: Units;
  onUpdateFeature: (id: string, patch: Partial<Feature>) => void;
}) {
  const setBoard = (patch: Partial<BoardMountSpec>) =>
    onUpdateFeature(feature.id, { board: { ...board, ...patch } });
  const setHole = (index: number, patch: Partial<{ x: number; y: number }>) =>
    setBoard({ holes: board.holes.map((h, i) => (i === index ? { ...h, ...patch } : h)) });

  return (
    <>
      <UnitNumberField
        label="Board width"
        valueMm={board.boardWidth}
        units={units}
        minMm={5}
        onChangeMm={(v) => setBoard({ boardWidth: v })}
      />
      <UnitNumberField
        label="Board depth"
        valueMm={board.boardDepth}
        units={units}
        minMm={5}
        onChangeMm={(v) => setBoard({ boardDepth: v })}
      />
      <UnitNumberField
        label="Standoff height"
        valueMm={board.standoff.height}
        units={units}
        minMm={1}
        onChangeMm={(v) => setBoard({ standoff: { ...board.standoff, height: v } })}
      />
      <UnitNumberField
        label="Standoff diameter"
        valueMm={board.standoff.outerDiameter}
        units={units}
        minMm={2}
        onChangeMm={(v) => setBoard({ standoff: { ...board.standoff, outerDiameter: v } })}
      />
      <UnitNumberField
        label="Screw hole diameter"
        valueMm={board.standoff.screwHoleDiameter}
        units={units}
        minMm={0.5}
        onChangeMm={(v) => setBoard({ standoff: { ...board.standoff, screwHoleDiameter: v } })}
      />

      <h3>Mounting holes (from board center)</h3>
      {board.holes.map((hole, i) => (
        <div className="hole-row" key={i}>
          <UnitNumberField
            label={`#${i + 1} X`}
            valueMm={hole.x}
            units={units}
            onChangeMm={(v) => setHole(i, { x: v })}
          />
          <UnitNumberField
            label="Y"
            valueMm={hole.y}
            units={units}
            onChangeMm={(v) => setHole(i, { y: v })}
          />
          <button
            type="button"
            aria-label={`Remove hole ${i + 1}`}
            onClick={() => setBoard({ holes: board.holes.filter((_, j) => j !== i) })}
          >
            ×
          </button>
        </div>
      ))}
      <div className="hole-actions">
        <button type="button" onClick={() => setBoard({ holes: [...board.holes, { x: 0, y: 0 }] })}>
          + Add hole
        </button>
        <button
          type="button"
          onClick={() => setBoard({ holes: cornerHolePattern(board.boardWidth, board.boardDepth, 3.5) })}
        >
          4-corner pattern
        </button>
      </div>
    </>
  );
}

function VentFields({
  feature,
  vent,
  units,
  onUpdateFeature,
}: {
  feature: Feature;
  vent: VentSpec;
  units: Units;
  onUpdateFeature: (id: string, patch: Partial<Feature>) => void;
}) {
  const setVent = (patch: Partial<VentSpec>) =>
    onUpdateFeature(feature.id, { vent: { ...vent, ...patch } });

  return (
    <>
      <label className="field">
        <span>Pattern</span>
        <select
          value={vent.pattern}
          onChange={(e) => setVent({ pattern: e.target.value as VentSpec['pattern'] })}
        >
          <option value="slots">Slots</option>
          <option value="honeycomb">Honeycomb</option>
        </select>
      </label>
      <UnitNumberField
        label="Area width"
        valueMm={vent.areaWidth}
        units={units}
        minMm={2}
        onChangeMm={(v) => setVent({ areaWidth: v })}
      />
      <UnitNumberField
        label="Area height"
        valueMm={vent.areaHeight}
        units={units}
        minMm={2}
        onChangeMm={(v) => setVent({ areaHeight: v })}
      />
      <UnitNumberField
        label={vent.pattern === 'slots' ? 'Slot width' : 'Cell size'}
        valueMm={vent.slotWidth}
        units={units}
        minMm={0.5}
        onChangeMm={(v) => setVent({ slotWidth: v })}
      />
      <UnitNumberField
        label="Spacing (pitch)"
        valueMm={vent.slotSpacing}
        units={units}
        minMm={1}
        onChangeMm={(v) => setVent({ slotSpacing: v })}
      />
    </>
  );
}

/** One axis's Start/Center/End align buttons plus its Mirror button, borrowed from SketchForge-
 * 3D's align/mirror overlay pattern: hovering (or focusing, for keyboard users) a button previews
 * the resulting position in the viewport via onPreviewTarget, and clicking commits it. Align moves
 * the selected feature in place; Mirror adds a reflected duplicate instead, since flattening it
 * into a move would destroy the original placement a symmetric layout still needs. */
function AlignMirrorAxisRow({
  feature,
  axis,
  label,
  onUpdateFeature,
  onAddFeature,
  onSelectFeature,
  onPreviewTarget,
}: {
  feature: Feature;
  axis: Axis;
  label: string;
  onUpdateFeature: (id: string, patch: Partial<Feature>) => void;
  onAddFeature: (feature: Feature) => void;
  onSelectFeature: (id: string | null) => void;
  onPreviewTarget: (target: PreviewTarget | null) => void;
}) {
  const preview = (target: AxisTarget | null) => {
    if (target === null) {
      onPreviewTarget(null);
      return;
    }
    onPreviewTarget({ face: feature.face, ...alignedPosition(feature, axis, target) });
  };
  const mirrored = mirroredPosition(feature, axis);
  const previewMirror = (show: boolean) => {
    onPreviewTarget(show && mirrored ? { face: feature.face, ...mirrored } : null);
  };

  return (
    <div className="align-row">
      <span className="align-row-label">{label}</span>
      <div className="align-row-buttons">
        {([0, 0.5, 1] as AxisTarget[]).map((target, i) => (
          <button
            key={target}
            type="button"
            onClick={() => {
              onUpdateFeature(feature.id, alignedPosition(feature, axis, target));
              onPreviewTarget(null);
            }}
            onMouseEnter={() => preview(target)}
            onMouseLeave={() => preview(null)}
            onFocus={() => preview(target)}
            onBlur={() => preview(null)}
          >
            {['Start', 'Center', 'End'][i]}
          </button>
        ))}
        <button
          type="button"
          disabled={!mirrored}
          title={mirrored ? `Duplicate, mirrored across the face's ${label} center` : 'Already centered on this axis'}
          onClick={() => {
            if (!mirrored) return;
            const copy = cloneFeatureAt(feature, mirrored);
            onAddFeature(copy);
            onSelectFeature(copy.id);
            onPreviewTarget(null);
          }}
          onMouseEnter={() => previewMirror(true)}
          onMouseLeave={() => previewMirror(false)}
          onFocus={() => previewMirror(true)}
          onBlur={() => previewMirror(false)}
        >
          Mirror
        </button>
      </div>
    </div>
  );
}

interface InspectorPanelProps {
  selectedFeatureId: string | null;
  onSelectFeature: (id: string | null) => void;
  onUpdateFeature: (id: string, patch: Partial<Feature>) => void;
  onRemoveFeature: (id: string) => void;
  onAddFeature: (feature: Feature) => void;
  onPreviewTarget: (target: PreviewTarget | null) => void;
}

export function InspectorPanel({
  selectedFeatureId,
  onSelectFeature,
  onUpdateFeature,
  onRemoveFeature,
  onAddFeature,
  onPreviewTarget,
}: InspectorPanelProps) {
  const project = useProjectStore((s) => s.project);
  const setBodyShape = useProjectStore((s) => s.setBodyShape);
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
  const setGasketEnabled = useProjectStore((s) => s.setGasketEnabled);
  const setGasketWidth = useProjectStore((s) => s.setGasketWidth);
  const setGasketDepth = useProjectStore((s) => s.setGasketDepth);

  const { body, units } = project;
  const { lid } = body;
  const selectedFeature = project.features.find((f) => f.id === selectedFeatureId) ?? null;
  const minPlanDimension = body.shape === 'box' ? Math.min(body.outer.length, body.outer.width) : body.outer.diameter;

  return (
    <div className="inspector-panel">
      <section>
        <h3>Body</h3>
        <label className="field">
          <span>Shape</span>
          <select value={body.shape} onChange={(e) => setBodyShape(e.target.value as BodyShape)}>
            <option value="box">Box</option>
            <option value="cylinder">Cylinder</option>
          </select>
        </label>
        {body.shape === 'box' ? (
          <>
            <UnitNumberField
              label="Length"
              valueMm={body.outer.length}
              units={units}
              minMm={5}
              onChangeMm={(v) => setBodyDimension('length', v)}
            />
            <UnitNumberField
              label="Width"
              valueMm={body.outer.width}
              units={units}
              minMm={5}
              onChangeMm={(v) => setBodyDimension('width', v)}
            />
          </>
        ) : (
          <UnitNumberField
            label="Diameter"
            valueMm={body.outer.diameter}
            units={units}
            minMm={5}
            onChangeMm={(v) => setBodyDimension('diameter', v)}
          />
        )}
        <UnitNumberField
          label="Height"
          valueMm={body.outer.height}
          units={units}
          minMm={5}
          onChangeMm={(v) => setBodyDimension('height', v)}
        />
        <UnitNumberField
          label="Wall thickness"
          valueMm={body.wallThickness}
          units={units}
          minMm={0.8}
          maxMm={minPlanDimension / 2 - 0.5}
          onChangeMm={setWallThickness}
        />
      </section>

      {body.shape === 'box' && (
        <section>
          <h3>Corners</h3>
          <label className="field">
            <span>Style</span>
            <select
              value={body.cornerStyle.type}
              onChange={(e) => setCornerStyleType(e.target.value as CornerStyleType)}
            >
              <option value="sharp">Sharp</option>
              <option value="rounded">Rounded</option>
              <option value="chamfered">Chamfered</option>
            </select>
          </label>
          {body.cornerStyle.type !== 'sharp' && (
            <UnitNumberField
              label="Corner radius"
              valueMm={body.cornerStyle.radius}
              units={units}
              minMm={0.5}
              maxMm={minPlanDimension / 2 - 0.5}
              onChangeMm={setCornerRadius}
            />
          )}
        </section>
      )}

      <section>
        <h3>Lid</h3>
        <label className="field">
          <span>Type</span>
          <select value={lid.type} onChange={(e) => setLidType(e.target.value as LidType)}>
            <option value="friction-lip">Friction lip</option>
            <option value="screw-boss">Screw boss</option>
            <option value="snap-fit">Snap fit</option>
          </select>
        </label>
        <UnitNumberField
          label="Split height"
          valueMm={lid.splitHeight}
          units={units}
          minMm={body.wallThickness + 1}
          maxMm={body.outer.height - body.wallThickness - 1}
          onChangeMm={setSplitHeight}
        />
        <UnitNumberField
          label="Wall gap (fit clearance)"
          valueMm={lid.wallGap}
          units={units}
          minMm={0}
          maxMm={1}
          stepMm={0.05}
          onChangeMm={setWallGap}
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

        <label className="field field-checkbox">
          <input
            type="checkbox"
            checked={lid.gasket !== undefined}
            onChange={(e) => setGasketEnabled(e.target.checked)}
          />
          <span>Gasket channel</span>
        </label>
        {lid.gasket && (
          <>
            <UnitNumberField
              label="Channel width"
              valueMm={lid.gasket.width}
              units={units}
              minMm={0.5}
              maxMm={Math.max(body.wallThickness - 0.4, 0.5)}
              stepMm={0.1}
              onChangeMm={setGasketWidth}
            />
            <UnitNumberField
              label="Channel depth"
              valueMm={lid.gasket.depth}
              units={units}
              minMm={0.2}
              maxMm={Math.max(lid.splitHeight - 1, 0.2)}
              stepMm={0.1}
              onChangeMm={setGasketDepth}
            />
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
          <div className="align-mirror">
            <AlignMirrorAxisRow
              feature={selectedFeature}
              axis="u"
              label="U"
              onUpdateFeature={onUpdateFeature}
              onAddFeature={onAddFeature}
              onSelectFeature={onSelectFeature}
              onPreviewTarget={onPreviewTarget}
            />
            <AlignMirrorAxisRow
              feature={selectedFeature}
              axis="v"
              label="V"
              onUpdateFeature={onUpdateFeature}
              onAddFeature={onAddFeature}
              onSelectFeature={onSelectFeature}
              onPreviewTarget={onPreviewTarget}
            />
          </div>
          {selectedFeature.type === 'connector-cutout' && selectedFeature.connectorId && (
            <ConnectorSizeFields
              feature={selectedFeature}
              entry={findConnector(selectedFeature.connectorId)}
              units={units}
              onUpdateFeature={onUpdateFeature}
            />
          )}
          {selectedFeature.type === 'board-mount' && selectedFeature.board && (
            <BoardMountFields
              feature={selectedFeature}
              board={selectedFeature.board}
              units={units}
              onUpdateFeature={onUpdateFeature}
            />
          )}
          {selectedFeature.type === 'vent' && selectedFeature.vent && (
            <VentFields feature={selectedFeature} vent={selectedFeature.vent} units={units} onUpdateFeature={onUpdateFeature} />
          )}
          {selectedFeature.type === 'custom-hole' && selectedFeature.custom && (
            <>
              <label className="field">
                <span>Shape</span>
                <select
                  value={selectedFeature.custom.shape}
                  onChange={(e) =>
                    onUpdateFeature(selectedFeature.id, {
                      custom: { ...selectedFeature.custom!, shape: e.target.value as 'circle' | 'rect' },
                    })
                  }
                >
                  <option value="circle">Circle</option>
                  <option value="rect">Rectangle</option>
                </select>
              </label>
              <UnitNumberField
                label={selectedFeature.custom.shape === 'circle' ? 'Diameter' : 'Width'}
                valueMm={selectedFeature.custom.width}
                units={units}
                minMm={0.5}
                onChangeMm={(v) =>
                  onUpdateFeature(selectedFeature.id, { custom: { ...selectedFeature.custom!, width: v } })
                }
              />
              {selectedFeature.custom.shape === 'rect' && (
                <UnitNumberField
                  label="Height"
                  valueMm={selectedFeature.custom.height ?? selectedFeature.custom.width}
                  units={units}
                  minMm={0.5}
                  onChangeMm={(v) =>
                    onUpdateFeature(selectedFeature.id, { custom: { ...selectedFeature.custom!, height: v } })
                  }
                />
              )}
            </>
          )}
          {selectedFeature.type === 'standoff' && selectedFeature.standoff && (
            <>
              <UnitNumberField
                label="Outer diameter"
                valueMm={selectedFeature.standoff.outerDiameter}
                units={units}
                minMm={2}
                onChangeMm={(v) =>
                  onUpdateFeature(selectedFeature.id, {
                    standoff: { ...selectedFeature.standoff!, outerDiameter: v },
                  })
                }
              />
              <UnitNumberField
                label="Screw hole diameter"
                valueMm={selectedFeature.standoff.screwHoleDiameter}
                units={units}
                minMm={0.5}
                onChangeMm={(v) =>
                  onUpdateFeature(selectedFeature.id, {
                    standoff: { ...selectedFeature.standoff!, screwHoleDiameter: v },
                  })
                }
              />
              <UnitNumberField
                label="Height"
                valueMm={selectedFeature.standoff.height}
                units={units}
                minMm={1}
                onChangeMm={(v) =>
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
