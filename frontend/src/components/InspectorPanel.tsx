import { useState, type ChangeEvent, type ReactNode } from 'react';
import { findConnector } from '../connectors/library';
import { useProjectStore } from '../state/projectStore';
import { displayStep, displayToMm, mmToDisplay, roundForDisplay, unitLabel } from '../state/units';
import { cornerHolePattern } from '../state/featureFactory';
import { alignedPosition, cloneFeatureAt, mirroredPosition, type Axis, type AxisTarget } from '../state/alignMirror';
import { bodyGeometry, faceSize } from '../csg/faceFrame';
import { effectiveSplitHeight } from '../csg/lidSplit';
import { FAN_PRESETS, fanSpecFor } from '../csg/fanLibrary';
import { bossRadiusFor } from '../csg/primitives';
import type { LidView, PreviewTarget } from './Viewport3D';
import type {
  BoardMountSpec,
  BodyShape,
  ConnectorLibraryEntry,
  CornerStyleType,
  Face,
  Feature,
  ExternalMountSpec,
  FanMountSpec,
  LidType,
  PanelFace,
  ScrewCount,
  ScrewInsertType,
  ScrewColumnShape,
  ScrewHeadStyle,
  ScrewPlacement,
  ScrewSize,
  SupportPadSpec,
  Units,
  VentSpec,
} from '../types/project';

function featureLabel(feature: Feature): string {
  if (feature.type === 'standoff') return 'Standoff';
  if (feature.type === 'board-mount') return 'Board mount';
  if (feature.type === 'vent') return 'Vent';
  if (feature.type === 'custom-hole') return 'Custom hole';
  if (feature.type === 'external-mount') {
    return feature.mount?.style === 'boss' ? 'External boss' : 'Mounting flange';
  }
  if (feature.type === 'fan-mount') return `${feature.fan?.size ?? ''}mm fan`;
  if (feature.type === 'support-pad') return 'Support pad';
  if (feature.type === 'connector-cutout' && feature.connectorId) {
    return findConnector(feature.connectorId)?.label ?? feature.connectorId;
  }
  return feature.type;
}

function SectionCard({
  title,
  icon,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: ReactNode;
  badge?: string | number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`inspector-card ${open ? 'open' : 'closed'}`}>
      <button type="button" className="card-header" onClick={() => setOpen(!open)}>
        <div className="card-header-title">
          {icon}
          <span>{title}</span>
          {badge !== undefined && <span className="card-badge">{badge}</span>}
        </div>
        <span className="card-arrow">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}

function FieldsGrid2Col({ children }: { children: ReactNode }) {
  return <div className="fields-grid-2col">{children}</div>;
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

function FeatureTypeIcon({ type }: { type: Feature['type'] }) {
  switch (type) {
    case 'standoff':
      return (
        <svg className="feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M17 5H7M19 12H5" />
        </svg>
      );
    case 'board-mount':
      return (
        <svg className="feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="16" cy="8" r="1.5" />
          <circle cx="8" cy="16" r="1.5" />
          <circle cx="16" cy="16" r="1.5" />
        </svg>
      );
    case 'vent':
      return (
        <svg className="feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 8h10M7 12h10M7 16h10" />
        </svg>
      );
    case 'support-pad':
      return (
        <svg className="feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 20h16" />
          <rect x="8" y="9" width="8" height="11" />
          <path d="M4 6h16" />
        </svg>
      );
    case 'fan-mount':
      return (
        <svg className="feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="2" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </svg>
      );
    case 'external-mount':
      return (
        <svg className="feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4v16" />
          <rect x="4" y="9" width="15" height="6" rx="1" />
          <circle cx="14" cy="12" r="2" />
        </svg>
      );
    default:
      return (
        <svg className="feat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <circle cx="9" cy="12" r="1.5" />
        </svg>
      );
  }
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
    <div className="inspector-subgroup">
      <div className="subgroup-title">Connector Dimensions</div>
      <FieldsGrid2Col>
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
      </FieldsGrid2Col>
      {override && (
        <button type="button" className="btn-secondary" onClick={() => onUpdateFeature(feature.id, { connectorOverride: undefined })}>
          Reset to library size
        </button>
      )}
    </div>
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
    <div className="inspector-subgroup">
      <div className="subgroup-title">Board & Standoff Specs</div>
      <FieldsGrid2Col>
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
          label="Standoff OD"
          valueMm={board.standoff.outerDiameter}
          units={units}
          minMm={2}
          onChangeMm={(v) => setBoard({ standoff: { ...board.standoff, outerDiameter: v } })}
        />
      </FieldsGrid2Col>
      <UnitNumberField
        label="Screw hole diameter"
        valueMm={board.standoff.screwHoleDiameter}
        units={units}
        minMm={0.5}
        onChangeMm={(v) => setBoard({ standoff: { ...board.standoff, screwHoleDiameter: v } })}
      />

      <div className="subgroup-title">Mounting Holes ({board.holes.length})</div>
      <div className="hole-table">
        {board.holes.map((hole, i) => (
          <div className="hole-table-row" key={i}>
            <span className="hole-num">#{i + 1}</span>
            <UnitNumberField
              label="X"
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
              className="hole-del-btn"
              aria-label={`Remove hole ${i + 1}`}
              onClick={() => setBoard({ holes: board.holes.filter((_, j) => j !== i) })}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="hole-actions">
        <button type="button" className="btn-secondary" onClick={() => setBoard({ holes: [...board.holes, { x: 0, y: 0 }] })}>
          + Add hole
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setBoard({ holes: cornerHolePattern(board.boardWidth, board.boardDepth, 3.5) })}
        >
          4-corner pattern
        </button>
      </div>
    </div>
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
    <div className="inspector-subgroup">
      <div className="subgroup-title">Vent Specification</div>
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
      <FieldsGrid2Col>
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
          label="Pitch (spacing)"
          valueMm={vent.slotSpacing}
          units={units}
          minMm={1}
          onChangeMm={(v) => setVent({ slotSpacing: v })}
        />
      </FieldsGrid2Col>
    </div>
  );
}

/** Editor for an external mount: the outward-growing counterpart to the interior standoff. Field
 * labels change with the style, since a flange's `width` is an ear length while a boss's is a
 * diameter. */
function ExternalMountFields({
  feature,
  mount,
  units,
  isBox,
  onUpdateFeature,
  onAddFeature,
}: {
  feature: Feature;
  mount: ExternalMountSpec;
  units: Units;
  isBox: boolean;
  onUpdateFeature: (id: string, patch: Partial<Feature>) => void;
  onAddFeature: (feature: Feature) => void;
}) {
  const setMount = (patch: Partial<ExternalMountSpec>) =>
    onUpdateFeature(feature.id, { mount: { ...mount, ...patch } });
  const isFlange = mount.style === 'flange';
  const isCorner = mount.anchor === 'corner' && isBox && feature.face !== 'top' && feature.face !== 'bottom';

  // The four vertical corners of a box, each expressed as a (face, u) pair -- front/back at u=0
  // and u=1 covers all of them, so "one on each corner" is just the three this mount isn't on.
  const cornerTargets: Array<{ face: Face; u: number }> = [
    { face: 'front', u: 0 },
    { face: 'front', u: 1 },
    { face: 'back', u: 0 },
    { face: 'back', u: 1 },
  ];
  const signsOf = (face: Face, u: number): [number, number] => {
    const near = u < 0.5 ? -1 : 1;
    return [face === 'left' ? -1 : face === 'right' ? 1 : near, face === 'front' ? -1 : face === 'back' ? 1 : near];
  };
  const [selfX, selfY] = signsOf(feature.face, feature.u);
  const fillCorners = () => {
    for (const target of cornerTargets) {
      const [sx, sy] = signsOf(target.face, target.u);
      if (sx === selfX && sy === selfY) continue;
      onAddFeature({
        ...structuredClone(feature),
        id: crypto.randomUUID(),
        face: target.face,
        u: target.u,
      });
    }
  };

  return (
    <div className="inspector-subgroup">
      <div className="subgroup-title">External Mount</div>
      <FieldsGrid2Col>
        <label className="field">
          <span>Style</span>
          <select
            value={mount.style}
            onChange={(e) => setMount({ style: e.target.value as ExternalMountSpec['style'] })}
          >
            <option value="flange">Flange (wall tab)</option>
            <option value="boss">Boss (post/foot)</option>
          </select>
        </label>
        <label className="field">
          <span>Anchored to</span>
          <select
            value={mount.anchor ?? 'face'}
            onChange={(e) => setMount({ anchor: e.target.value as ExternalMountSpec['anchor'] })}
          >
            <option value="face">Face (at U/V)</option>
            <option value="corner">Nearest corner</option>
          </select>
        </label>
        <label className="field">
          <span>Hole</span>
          <select
            value={mount.hole}
            onChange={(e) => setMount({ hole: e.target.value as ExternalMountSpec['hole'] })}
          >
            <option value="none">None</option>
            <option value="round">Round</option>
            {isFlange && <option value="slot">Slot</option>}
            {isFlange && <option value="keyhole">Keyhole</option>}
          </select>
        </label>
      </FieldsGrid2Col>
      <FieldsGrid2Col>
        <UnitNumberField
          label={isFlange ? 'Tab width' : 'Post diameter'}
          valueMm={mount.width}
          units={units}
          minMm={1}
          onChangeMm={(v) => setMount({ width: v })}
        />
        <UnitNumberField
          label={isFlange ? 'Reach out' : 'Post height'}
          valueMm={mount.protrusion}
          units={units}
          minMm={1}
          onChangeMm={(v) => setMount({ protrusion: v })}
        />
        {isFlange && (
          <UnitNumberField
            label="Plate thickness"
            valueMm={mount.thickness}
            units={units}
            minMm={0.8}
            onChangeMm={(v) => setMount({ thickness: v })}
          />
        )}
        {mount.hole !== 'none' && (
          <UnitNumberField
            label="Hole dia"
            valueMm={mount.holeDiameter}
            units={units}
            minMm={0.5}
            onChangeMm={(v) => setMount({ holeDiameter: v })}
          />
        )}
        {(mount.hole === 'slot' || mount.hole === 'keyhole') && (
          <UnitNumberField
            label={mount.hole === 'slot' ? 'Slot length' : 'Keyhole travel'}
            valueMm={mount.slotLength}
            units={units}
            minMm={1}
            onChangeMm={(v) => setMount({ slotLength: v })}
          />
        )}
        {!isFlange && mount.hole !== 'none' && (
          <UnitNumberField
            label="Hole depth (0 = through)"
            valueMm={mount.holeDepth ?? 0}
            units={units}
            minMm={0}
            onChangeMm={(v) => setMount({ holeDepth: v > 0 ? v : undefined })}
          />
        )}
      </FieldsGrid2Col>
      {isCorner && (
        <>
          <button type="button" className="btn-secondary" onClick={fillCorners}>
            Put one on each corner
          </button>
          <p className="field-hint">
            Corner mounts sit on the diagonal and weld into both walls, so U only picks which end of
            the face they snap to — V still sets their height.
          </p>
        </>
      )}
    </div>
  );
}

/** Editor for a fan opening. Picking a size re-derives the standard hole pitch and screw size for
 * that fan (FAN_PRESETS), keeping the grille choices the user has already made. */
function FanMountFields({
  feature,
  fan,
  units,
  onUpdateFeature,
}: {
  feature: Feature;
  fan: FanMountSpec;
  units: Units;
  onUpdateFeature: (id: string, patch: Partial<Feature>) => void;
}) {
  const setFan = (patch: Partial<FanMountSpec>) =>
    onUpdateFeature(feature.id, { fan: { ...fan, ...patch } });
  const resize = (size: number) =>
    onUpdateFeature(feature.id, {
      fan: { ...fanSpecFor(size), grille: fan.grille, bossHeight: fan.bossHeight },
    });

  return (
    <div className="inspector-subgroup">
      <div className="subgroup-title">Fan Opening</div>
      <FieldsGrid2Col>
        <label className="field">
          <span>Fan size</span>
          <select value={fan.size} onChange={(e) => resize(Number(e.target.value))}>
            {FAN_PRESETS.map((preset) => (
              <option key={preset.size} value={preset.size}>
                {preset.size}×{preset.size}mm
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Grille</span>
          <select
            value={fan.grille}
            onChange={(e) => setFan({ grille: e.target.value as FanMountSpec['grille'] })}
          >
            <option value="concentric">Concentric rings</option>
            <option value="honeycomb">Honeycomb</option>
            <option value="open">Open hole</option>
          </select>
        </label>
        <UnitNumberField
          label="Fan body depth"
          valueMm={fan.bodyDepth}
          units={units}
          minMm={1}
          onChangeMm={(v) => setFan({ bodyDepth: v })}
        />
        <UnitNumberField
          label="Screw pitch"
          valueMm={fan.holePitch}
          units={units}
          minMm={1}
          onChangeMm={(v) => setFan({ holePitch: v })}
        />
        <UnitNumberField
          label="Screw hole"
          valueMm={fan.screwHoleDiameter}
          units={units}
          minMm={0.5}
          onChangeMm={(v) => setFan({ screwHoleDiameter: v })}
        />
        {fan.grille === 'concentric' && (
          <>
            <UnitNumberField
              label="Ring width"
              valueMm={fan.ringWidth}
              units={units}
              minMm={0.5}
              onChangeMm={(v) => setFan({ ringWidth: v })}
            />
            <UnitNumberField
              label="Ring bridge"
              valueMm={fan.ringGap}
              units={units}
              minMm={0.5}
              onChangeMm={(v) => setFan({ ringGap: v })}
            />
            <NumberField
              label="Spokes"
              value={fan.spokeCount}
              min={0}
              max={12}
              step={2}
              onChange={(v) => setFan({ spokeCount: v })}
            />
            <UnitNumberField
              label="Spoke width"
              valueMm={fan.spokeWidth}
              units={units}
              minMm={0.4}
              onChangeMm={(v) => setFan({ spokeWidth: v })}
            />
            <UnitNumberField
              label="Hub hole"
              valueMm={fan.hubDiameter}
              units={units}
              minMm={0}
              onChangeMm={(v) => setFan({ hubDiameter: v })}
            />
          </>
        )}
        <UnitNumberField
          label="Mount boss height"
          valueMm={fan.bossHeight}
          units={units}
          minMm={0}
          onChangeMm={(v) => setFan({ bossHeight: v })}
        />
      </FieldsGrid2Col>
      <p className="field-hint">
        Screw holes sit on the fan's own {fan.holePitch}mm bolt circle. Bosses (if any) stand on the
        inside face, so the fan pulls against a pad instead of the bare wall. Body depth is only
        drawn as a ghost inside the case (nothing is printed from it) -- it's there to check the fan
        clears whatever sits under it.
      </p>
    </div>
  );
}

/** Editor for a support pad: a blind floor pillar propping up an unsupported board edge. */
function SupportPadFields({
  feature,
  pad,
  units,
  onUpdateFeature,
}: {
  feature: Feature;
  pad: SupportPadSpec;
  units: Units;
  onUpdateFeature: (id: string, patch: Partial<Feature>) => void;
}) {
  const setPad = (patch: Partial<SupportPadSpec>) =>
    onUpdateFeature(feature.id, { pad: { ...pad, ...patch } });

  return (
    <div className="inspector-subgroup">
      <div className="subgroup-title">Support Pad</div>
      <FieldsGrid2Col>
        <label className="field">
          <span>Shape</span>
          <select
            value={pad.shape}
            onChange={(e) => setPad({ shape: e.target.value as SupportPadSpec['shape'] })}
          >
            <option value="rect">Rectangular</option>
            <option value="round">Round</option>
          </select>
        </label>
        <UnitNumberField
          label={pad.shape === 'round' ? 'Diameter' : 'Width (U)'}
          valueMm={pad.width}
          units={units}
          minMm={1}
          onChangeMm={(v) => setPad({ width: v })}
        />
        {pad.shape === 'rect' && (
          <UnitNumberField
            label="Depth (V)"
            valueMm={pad.depth}
            units={units}
            minMm={1}
            onChangeMm={(v) => setPad({ depth: v })}
          />
        )}
        <UnitNumberField
          label="Height"
          valueMm={pad.height}
          units={units}
          minMm={0.5}
          onChangeMm={(v) => setPad({ height: v })}
        />
      </FieldsGrid2Col>
      <p className="field-hint">
        Set the height to the board's standoff height so the pad meets the underside without lifting
        it. No screw hole -- it props, it doesn't fasten.
      </p>
    </div>
  );
}

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
      <span className="align-row-label">{label} Axis</span>
      <div className="align-row-buttons">
        {([0, 0.5, 1] as AxisTarget[]).map((target, i) => (
          <button
            key={target}
            type="button"
            className="btn-align"
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
          className="btn-mirror"
          disabled={!mirrored}
          title={mirrored ? `Duplicate, mirrored across ${label} center` : 'Already centered'}
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

function SidebarSectionIcon({ type }: { type: 'viewport' | 'body' | 'fasteners' | 'layers' | 'inspector' }) {
  const iconStyle = { width: 14, height: 14, strokeWidth: 2 };
  switch (type) {
    case 'viewport':
      return (
        <svg className="card-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={iconStyle}>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'body':
      return (
        <svg className="card-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={iconStyle}>
          <path d="M21 8L12 3 3 8l9 5 9-5z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case 'fasteners':
      return (
        <svg className="card-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={iconStyle}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case 'layers':
      return (
        <svg className="card-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={iconStyle}>
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      );
    case 'inspector':
      return (
        <svg className="card-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={iconStyle}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
}

function SvgEyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SvgEyeOffIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function SvgLockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function SvgUnlockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function SvgCopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function SvgTrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

interface InspectorPanelProps {
  selectedFeatureId: string | null;
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
  onSelectFeature: (id: string | null) => void;
  onUpdateFeature: (id: string, patch: Partial<Feature>) => void;
  onRemoveFeature: (id: string) => void;
  onAddFeature: (feature: Feature) => void;
  onPreviewTarget: (target: PreviewTarget | null) => void;
}

export function InspectorPanel({
  selectedFeatureId,
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
  const setScrewEdgeInset = useProjectStore((s) => s.setScrewEdgeInset);
  const setScrewPlacement = useProjectStore((s) => s.setScrewPlacement);
  const setScrewColumnShape = useProjectStore((s) => s.setScrewColumnShape);
  const setScrewHeadStyle = useProjectStore((s) => s.setScrewHeadStyle);
  const setScrewColumnHeight = useProjectStore((s) => s.setScrewColumnHeight);
  const setGasketEnabled = useProjectStore((s) => s.setGasketEnabled);
  const setGasketWidth = useProjectStore((s) => s.setGasketWidth);
  const setGasketDepth = useProjectStore((s) => s.setGasketDepth);
  const setPanelsEnabled = useProjectStore((s) => s.setPanelsEnabled);
  const togglePanelFace = useProjectStore((s) => s.togglePanelFace);
  const setPanelThickness = useProjectStore((s) => s.setPanelThickness);
  const setPanelFitClearance = useProjectStore((s) => s.setPanelFitClearance);
  const setPanelGrooveDepth = useProjectStore((s) => s.setPanelGrooveDepth);
  const setPanelCaptureInLid = useProjectStore((s) => s.setPanelCaptureInLid);

  const { body, units } = project;
  const { lid } = body;
  const selectedFeature = project.features.find((f) => f.id === selectedFeatureId) ?? null;
  const minPlanDimension = body.shape === 'box' ? Math.min(body.outer.length, body.outer.width) : body.outer.diameter;

  return (
    <div className="inspector-panel">
      <SectionCard title="View" icon={<SidebarSectionIcon type="viewport" />} defaultOpen={true}>
        <div className="subgroup-title">Lid Presentation Mode</div>
        <div className="lid-view-buttons">
          {(['assembled', 'ghost', 'hidden', 'exploded'] as LidView[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`btn-lid-mode ${lidView === mode ? 'active' : ''}`}
              onClick={() => onSetLidView(mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <label className="field field-checkbox" style={{ marginTop: '8px' }}>
          <input
            type="checkbox"
            checked={showHandles}
            onChange={(e) => onToggleShowHandles(e.target.checked)}
          />
          <span>Show 3D Resize Handles</span>
        </label>
        <label className="field field-checkbox">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(e) => onToggleShowGrid(e.target.checked)}
          />
          <span>Show Grid &amp; Floor Axes</span>
        </label>
        <label className="field field-checkbox">
          <input
            type="checkbox"
            checked={showGhosts}
            onChange={(e) => onToggleShowGhosts(e.target.checked)}
          />
          <span>Show Ghost Parts</span>
        </label>
        <label className="field field-checkbox">
          <input
            type="checkbox"
            checked={showMarkers}
            onChange={(e) => onToggleShowMarkers(e.target.checked)}
          />
          <span>Show Feature Markers</span>
        </label>
      </SectionCard>
      <SectionCard title="Lid & Fasteners" icon={<SidebarSectionIcon type="fasteners" />}>
        <label className="field">
          <span>Type</span>
          <select value={lid.type} onChange={(e) => setLidType(e.target.value as LidType)}>
            <option value="friction-lip">Friction lip</option>
            <option value="screw-boss">Screw boss</option>
            <option value="snap-fit">Snap fit</option>
          </select>
        </label>
        {/* Split-height percentage slider — the main control for lid/body proportions */}
        {(() => {
          const outerH = body.outer.height;
          const minSplit = body.wallThickness + 1;
          const maxSplit = outerH - body.wallThickness - 1;
          const pct = Math.round((lid.splitHeight / outerH) * 100);
          const lidPct = 100 - pct;
          // fillPct is position of the thumb within [minSplit, maxSplit] — this is what drives
          // the two-colour track gradient and must be recomputed from the clamped slider range,
          // not from the raw splitHeight/outerH ratio, or the thumb and fill won't stay in sync.
          const fillPct = ((lid.splitHeight - minSplit) / (maxSplit - minSplit)) * 100;
          const trackBg = `linear-gradient(to right, #3a6fa8 0%, #3a6fa8 ${fillPct}%, #2e6e5c ${fillPct}%, #2e6e5c 100%)`;
          return (
            <div className="split-slider-row">
              <div className="split-slider-labels">
                <span className="split-label-body">Body <strong>{pct}%</strong></span>
                <span className="split-label-lid">Lid <strong>{lidPct}%</strong></span>
              </div>
              <input
                id="split-height-slider"
                type="range"
                className="split-slider"
                min={minSplit}
                max={maxSplit}
                step={0.5}
                value={lid.splitHeight}
                style={{ background: trackBg }}
                onChange={(e) => setSplitHeight(Number(e.target.value))}
              />
            </div>
          );
        })()}

        <FieldsGrid2Col>
          <UnitNumberField
            label="Split height"
            valueMm={lid.splitHeight}
            units={units}
            minMm={body.wallThickness + 1}
            maxMm={body.outer.height - body.wallThickness - 1}
            onChangeMm={setSplitHeight}
          />
          <UnitNumberField
            label="Wall gap"
            valueMm={lid.wallGap}
            units={units}
            minMm={0}
            maxMm={1}
            stepMm={0.05}
            onChangeMm={setWallGap}
          />
        </FieldsGrid2Col>


        {lid.type === 'screw-boss' && lid.screw && (
          <FieldsGrid2Col>
            <label className="field">
              <span>Screw size</span>
              <select
                value={lid.screw.size}
                onChange={(e) => setScrewSize(e.target.value as ScrewSize)}
              >
                <option value="M2">M2</option>
                <option value="M2.5">M2.5</option>
                <option value="M3">M3</option>
                <option value="M4">M4</option>
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
            {body.shape === 'box' && (
              <label className="field">
                <span>Column placement</span>
                <select
                  value={lid.screw.placement ?? 'interior'}
                  onChange={(e) => setScrewPlacement(e.target.value as ScrewPlacement)}
                >
                  <option value="interior">Inside the cavity</option>
                  <option value="exterior">Outside the walls</option>
                </select>
              </label>
            )}
            <label className="field">
              <span>Column shape</span>
              <select
                value={lid.screw.shape ?? 'round'}
                onChange={(e) => setScrewColumnShape(e.target.value as ScrewColumnShape)}
              >
                <option value="round">Round</option>
                <option value="square">Square</option>
              </select>
            </label>
            <label className="field">
              <span>Screw head</span>
              <select
                value={lid.screw.headStyle ?? 'flush'}
                onChange={(e) => setScrewHeadStyle(e.target.value as ScrewHeadStyle)}
              >
                <option value="flush">On the surface</option>
                <option value="counterbore">Concealed (counterbored)</option>
              </select>
            </label>
            {(lid.screw.placement ?? 'interior') === 'interior' && (
              <UnitNumberField
                label="Screw edge inset"
                valueMm={lid.screw.edgeInset ?? bossRadiusFor(lid.screw) + 1}
                units={units}
                minMm={0.5}
                maxMm={Math.max(minPlanDimension / 2 - 2, 0.5)}
                stepMm={0.1}
                onChangeMm={setScrewEdgeInset}
              />
            )}
          </FieldsGrid2Col>
        )}
        {lid.type === 'screw-boss' && lid.screw && (
          <>
            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={lid.screw.columnHeight === undefined}
                onChange={(e) =>
                  setScrewColumnHeight(
                    e.target.checked ? undefined : Math.max(effectiveSplitHeight(body) / 2, 4),
                  )
                }
              />
              <span>Columns run the full height</span>
            </label>
            {lid.screw.columnHeight !== undefined && (
              <UnitNumberField
                label="Column height"
                valueMm={lid.screw.columnHeight}
                units={units}
                minMm={2}
                maxMm={effectiveSplitHeight(body)}
                onChangeMm={setScrewColumnHeight}
              />
            )}
            <p className="field-hint">
              {(lid.screw.placement ?? 'interior') === 'interior'
                ? 'Distance from the interior wall to each screw boss. Smaller pulls bosses toward the ' +
                  "case's outer edge -- useful for keeping them clear of a board-mount sitting in the " +
                  'middle of the cavity. '
                : 'Exterior columns stand against the outside of the front and back walls -- the option ' +
                  'for a case whose board leaves no floor space inside. '}
              A short column hangs from the lid seam instead of standing on the floor, keeping the
              space underneath clear; it is pushed into the wall far enough to weld to it.
            </p>
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
          <FieldsGrid2Col>
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
          </FieldsGrid2Col>
        )}
      </SectionCard>

      <SectionCard title="Body" icon={<SidebarSectionIcon type="body" />}>
        <label className="field">
          <span>Shape</span>
          <select value={body.shape} onChange={(e) => setBodyShape(e.target.value as BodyShape)}>
            <option value="box">Box</option>
            <option value="cylinder">Cylinder</option>
          </select>
        </label>
        {body.shape === 'box' ? (
          <FieldsGrid2Col>
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
          </FieldsGrid2Col>
        ) : (
          <UnitNumberField
            label="Diameter"
            valueMm={body.outer.diameter}
            units={units}
            minMm={5}
            onChangeMm={(v) => setBodyDimension('diameter', v)}
          />
        )}
        <FieldsGrid2Col>
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
        </FieldsGrid2Col>
        {body.shape === 'box' && (
          <div className="inspector-subgroup">
            <div className="subgroup-title">Slide-in Panels</div>
            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={body.panels !== undefined}
                onChange={(e) => setPanelsEnabled(e.target.checked)}
              />
              <span>Print selected walls as separate plates</span>
            </label>
            {body.panels && (
              <>
                <div className="panel-face-buttons">
                  {(['front', 'back', 'left', 'right'] as PanelFace[]).map((face) => (
                    <button
                      key={face}
                      type="button"
                      className={`btn-lid-mode ${body.panels!.faces.includes(face) ? 'active' : ''}`}
                      onClick={() => togglePanelFace(face)}
                    >
                      {face.charAt(0).toUpperCase() + face.slice(1)}
                    </button>
                  ))}
                </div>
                <FieldsGrid2Col>
                  <UnitNumberField
                    label="Plate thickness"
                    valueMm={body.panels.thickness}
                    units={units}
                    minMm={0.8}
                    onChangeMm={setPanelThickness}
                  />
                  <UnitNumberField
                    label="Groove depth"
                    valueMm={body.panels.grooveDepth}
                    units={units}
                    minMm={0.2}
                    maxMm={Math.max(body.wallThickness - 0.8, 0.2)}
                    onChangeMm={setPanelGrooveDepth}
                  />
                  <UnitNumberField
                    label="Slide fit gap"
                    valueMm={body.panels.fitClearance}
                    units={units}
                    minMm={0}
                    maxMm={1.5}
                    stepMm={0.05}
                    onChangeMm={setPanelFitClearance}
                  />
                </FieldsGrid2Col>
                <label className="field field-checkbox">
                  <input
                    type="checkbox"
                    checked={body.panels.captureInLid}
                    onChange={(e) => setPanelCaptureInLid(e.target.checked)}
                  />
                  <span>Capture plate top in the lid</span>
                </label>
                <p className="field-hint">
                  Each selected wall becomes its own STL, sliding down into grooves in the
                  neighbouring walls and the floor. Cutouts placed on that face are cut into the
                  plate.
                </p>
              </>
            )}
          </div>
        )}
        {body.shape === 'box' && (
          <div className="inspector-subgroup">
            <div className="subgroup-title">Corner Style</div>
            <FieldsGrid2Col>
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
            </FieldsGrid2Col>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Feature Layers" icon={<SidebarSectionIcon type="layers" />} badge={project.features.length}>
        {project.features.length === 0 ? (
          <p className="feature-list-empty">None placed yet — pick one from the palette, then click a face.</p>
        ) : (() => {
          const allHidden = project.features.every((f) => f.hidden);
          const allLocked = project.features.every((f) => f.locked);
          const setAll = (patch: Partial<Feature>) => {
            for (const f of project.features) onUpdateFeature(f.id, patch);
          };
          return (
            <>
              <div className="layer-bulk-actions">
                <button type="button" className="btn-secondary" onClick={() => setAll({ hidden: !allHidden })}>
                  {allHidden ? <SvgEyeIcon /> : <SvgEyeOffIcon />}
                  <span>{allHidden ? 'Show all' : 'Hide all'}</span>
                </button>
                <button type="button" className="btn-secondary" onClick={() => setAll({ locked: !allLocked })}>
                  {allLocked ? <SvgUnlockIcon /> : <SvgLockIcon />}
                  <span>{allLocked ? 'Unlock all' : 'Lock all'}</span>
                </button>
              </div>
          <div className="placed-features-list">
            {project.features.map((feature) => {
              const isSelected = feature.id === selectedFeatureId;
              const isHidden = !!feature.hidden;
              const isLocked = !!feature.locked;
              return (
                <div
                  key={feature.id}
                  className={`placed-feature-card ${isSelected ? 'selected' : ''} ${isHidden ? 'hidden-layer' : ''} ${isLocked ? 'locked-layer' : ''}`}
                  onClick={() => onSelectFeature(feature.id)}
                >
                  <div className="feat-card-main">
                    <FeatureTypeIcon type={feature.type} />
                    <span className="feat-card-name">{featureLabel(feature)}</span>
                    <span className="face-badge">{feature.face}</span>
                  </div>
                  <div className="layer-actions">
                    <button
                      type="button"
                      className={`layer-btn ${isHidden ? 'active-toggle' : ''}`}
                      title={isHidden ? 'Show feature' : 'Hide feature'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateFeature(feature.id, { hidden: !isHidden });
                      }}
                    >
                      {isHidden ? <SvgEyeOffIcon /> : <SvgEyeIcon />}
                    </button>
                    <button
                      type="button"
                      className={`layer-btn ${isLocked ? 'active-toggle' : ''}`}
                      title={isLocked ? 'Unlock feature 3D dragging' : 'Lock feature 3D dragging'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateFeature(feature.id, { locked: !isLocked });
                      }}
                    >
                      {isLocked ? <SvgLockIcon /> : <SvgUnlockIcon />}
                    </button>
                    <button
                      type="button"
                      className="layer-btn"
                      title="Duplicate feature"
                      onClick={(e) => {
                        e.stopPropagation();
                        const dup = cloneFeatureAt(feature, {
                          u: Math.min(feature.u + 0.05, 1),
                          v: feature.v,
                        });
                        onAddFeature(dup);
                        onSelectFeature(dup.id);
                      }}
                    >
                      <SvgCopyIcon />
                    </button>
                    <button
                      type="button"
                      className="layer-btn layer-del-btn"
                      title="Delete feature"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFeature(feature.id);
                      }}
                    >
                      <SvgTrashIcon />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
            </>
          );
        })()}
      </SectionCard>

      {selectedFeature && (() => {
        const geom = bodyGeometry(body);
        const [sizeU, sizeV] = faceSize(selectedFeature.face, geom);
        const uOffsetMm = (selectedFeature.u - 0.5) * sizeU;
        const vOffsetMm = (selectedFeature.v - 0.5) * sizeV;

        return (
          <SectionCard title={`Inspector: ${featureLabel(selectedFeature)}`} icon={<SidebarSectionIcon type="inspector" />} defaultOpen={true}>
            <>
              <div className="inspector-subgroup" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
              <div className="subgroup-title">Placement & Face</div>
              <label className="field">
                <span>Target Face</span>
                <select
                  value={selectedFeature.face}
                  onChange={(e) => onUpdateFeature(selectedFeature.id, { face: e.target.value as Face })}
                >
                  {body.shape === 'box' ? (
                    <>
                      <option value="front">Front</option>
                      <option value="back">Back</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                    </>
                  ) : (
                    <>
                      <option value="side">Side</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                    </>
                  )}
                </select>
              </label>

              <FieldsGrid2Col>
                <UnitNumberField
                  label="U Center Offset"
                  valueMm={uOffsetMm}
                  units={units}
                  onChangeMm={(valMm) => {
                    const nextU = Math.max(0, Math.min(1, 0.5 + valMm / sizeU));
                    onUpdateFeature(selectedFeature.id, { u: nextU });
                  }}
                />
                <UnitNumberField
                  label="V Center Offset"
                  valueMm={vOffsetMm}
                  units={units}
                  onChangeMm={(valMm) => {
                    const nextV = Math.max(0, Math.min(1, 0.5 + valMm / sizeV));
                    onUpdateFeature(selectedFeature.id, { v: nextV });
                  }}
                />
              </FieldsGrid2Col>

              <FieldsGrid2Col>
                <NumberField
                  label="U Ratio (0–1)"
                  value={roundForDisplay(selectedFeature.u, 'mm')}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => onUpdateFeature(selectedFeature.id, { u: Math.max(0, Math.min(1, v)) })}
                />
                <NumberField
                  label="V Ratio (0–1)"
                  value={roundForDisplay(selectedFeature.v, 'mm')}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => onUpdateFeature(selectedFeature.id, { v: Math.max(0, Math.min(1, v)) })}
                />
              </FieldsGrid2Col>

              <FieldsGrid2Col>
                <NumberField
                  label="Rotation (deg)"
                  value={selectedFeature.rotationDeg}
                  step={5}
                  onChange={(v) => onUpdateFeature(selectedFeature.id, { rotationDeg: v })}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ marginTop: 'auto', marginBottom: '2px' }}
                  onClick={() => {
                    const dup = cloneFeatureAt(selectedFeature, {
                      u: Math.min(selectedFeature.u + 0.05, 1),
                      v: selectedFeature.v,
                    });
                    onAddFeature(dup);
                    onSelectFeature(dup.id);
                  }}
                >
                  + Duplicate
                </button>
              </FieldsGrid2Col>
            </div>

            <div className="align-mirror">
              <div className="subgroup-title">Quick Alignment & Mirror</div>
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

          {selectedFeature.type === 'external-mount' && selectedFeature.mount && (
            <ExternalMountFields
              feature={selectedFeature}
              mount={selectedFeature.mount}
              units={units}
              isBox={body.shape === 'box'}
              onUpdateFeature={onUpdateFeature}
              onAddFeature={onAddFeature}
            />
          )}

          {selectedFeature.type === 'support-pad' && selectedFeature.pad && (
            <SupportPadFields
              feature={selectedFeature}
              pad={selectedFeature.pad}
              units={units}
              onUpdateFeature={onUpdateFeature}
            />
          )}

          {selectedFeature.type === 'fan-mount' && selectedFeature.fan && (
            <FanMountFields
              feature={selectedFeature}
              fan={selectedFeature.fan}
              units={units}
              onUpdateFeature={onUpdateFeature}
            />
          )}

          {selectedFeature.type === 'vent' && selectedFeature.vent && (
            <VentFields feature={selectedFeature} vent={selectedFeature.vent} units={units} onUpdateFeature={onUpdateFeature} />
          )}

          {selectedFeature.type === 'custom-hole' && selectedFeature.custom && (
            <div className="inspector-subgroup">
              <div className="subgroup-title">Custom Hole Spec</div>
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
              <FieldsGrid2Col>
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
              </FieldsGrid2Col>
            </div>
          )}

          {selectedFeature.type === 'standoff' && selectedFeature.standoff && (
            <div className="inspector-subgroup">
              <div className="subgroup-title">Standoff Dimensions</div>
              <FieldsGrid2Col>
                <UnitNumberField
                  label="Outer OD"
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
                  label="Hole dia"
                  valueMm={selectedFeature.standoff.screwHoleDiameter}
                  units={units}
                  minMm={0.5}
                  onChangeMm={(v) =>
                    onUpdateFeature(selectedFeature.id, {
                      standoff: { ...selectedFeature.standoff!, screwHoleDiameter: v },
                    })
                  }
                />
              </FieldsGrid2Col>
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
            </div>
          )}
        </>
      </SectionCard>
      );
    })()}
    </div>
  );
}
