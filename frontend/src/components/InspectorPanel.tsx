import type { ChangeEvent } from 'react';
import { useProjectStore } from '../state/projectStore';
import type { CornerStyleType, LidType, ScrewCount, ScrewInsertType, ScrewSize } from '../types/project';

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

export function InspectorPanel() {
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
    </div>
  );
}
