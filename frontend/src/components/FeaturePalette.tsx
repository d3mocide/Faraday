import { CONNECTOR_LIBRARY } from '../connectors/library';
import type { ConnectorCategory } from '../types/project';

export type ArmedFeatureTemplate =
  | { type: 'connector-cutout'; connectorId: string; label: string }
  | { type: 'standoff'; label: string };

interface FeaturePaletteProps {
  armed: ArmedFeatureTemplate | null;
  onArm: (template: ArmedFeatureTemplate) => void;
  onDisarm: () => void;
}

const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  rf: 'RF',
  usb: 'USB',
  power: 'Power',
  antenna: 'Antenna',
  video: 'Video',
  network: 'Network',
  audio: 'Audio',
  misc: 'Misc',
};

const CATEGORY_ORDER: ConnectorCategory[] = [
  'rf',
  'usb',
  'video',
  'network',
  'audio',
  'power',
  'antenna',
  'misc',
];

export function FeaturePalette({ armed, onArm, onDisarm }: FeaturePaletteProps) {
  const categories = CATEGORY_ORDER.filter((category) =>
    CONNECTOR_LIBRARY.some((entry) => entry.category === category),
  );

  return (
    <div className="feature-palette">
      <h3>Features</h3>

      {armed && (
        <div className="palette-armed-hint">
          <p>
            Click a face in the viewport to place <strong>{armed.label}</strong>.
            {armed.type === 'standoff' &&
              ' Standoffs mount to the base floor — hide the lid (viewport toolbar) and click the interior floor, or rotate under the model and click the bottom face.'}
          </p>
          <button type="button" onClick={onDisarm}>
            Cancel
          </button>
        </div>
      )}

      <section>
        <h4>Mounting</h4>
        <button
          type="button"
          className={armed?.type === 'standoff' ? 'palette-item armed' : 'palette-item'}
          onClick={() => onArm({ type: 'standoff', label: 'Standoff' })}
        >
          Standoff (PCB mount)
        </button>
      </section>

      {categories.map((category) => (
        <section key={category}>
          <h4>{CATEGORY_LABELS[category]}</h4>
          {CONNECTOR_LIBRARY.filter((entry) => entry.category === category).map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={
                armed?.type === 'connector-cutout' && armed.connectorId === entry.id
                  ? 'palette-item armed'
                  : 'palette-item'
              }
              title={entry.notes}
              onClick={() => onArm({ type: 'connector-cutout', connectorId: entry.id, label: entry.label })}
            >
              {entry.label}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
