import { useMemo, useState } from 'react';
import { BOARD_PRESETS, type BoardPreset } from '../presets/boards';
import { buildPresetFeatures } from '../state/featureFactory';
import { useProjectStore } from '../state/projectStore';

interface BoardPresetPickerProps {
  onClose: () => void;
}

type PresetTab = 'complete' | 'case-only';

// A preset with `io` cuts real port openings into the walls, so it stands in for the full
// assembled board. Everything else -- dimension-only presets and mount-pattern-only presets
// alike -- is a bare case starting point, mount holes or not.
const hasIoCutouts = (preset: BoardPreset) => Boolean(preset.io && preset.io.length > 0);

const TABS: { id: PresetTab; label: string }[] = [
  { id: 'complete', label: 'Complete Boards (IO)' },
  { id: 'case-only', label: 'Case Only' },
];

export function BoardPresetPicker({ onClose }: BoardPresetPickerProps) {
  const applyBoardPreset = useProjectStore((s) => s.applyBoardPreset);
  const [tab, setTab] = useState<PresetTab>('complete');

  const visiblePresets = useMemo(
    () => BOARD_PRESETS.filter((preset) => (tab === 'complete' ? hasIoCutouts(preset) : !hasIoCutouts(preset))),
    [tab],
  );

  const handlePick = (presetId: string) => {
    const preset = BOARD_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    applyBoardPreset(preset.body, buildPresetFeatures(preset));
    onClose();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal preset-modal">
        <div className="preset-modal-header">
          <h3>Start from a board</h3>
          <p className="preset-modal-hint">
            Sets body size, wall thickness, and split height to fit the board; clears any placed
            features. Starter dimensions -- verify against your actual hardware.
          </p>
        </div>
        <div className="preset-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`preset-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <ul className="preset-list">
          {visiblePresets.map((preset) => (
            <li key={preset.id}>
              <button type="button" onClick={() => handlePick(preset.id)}>
                <span className="preset-label">{preset.label}</span>
                <span className="preset-notes">{preset.notes}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="preset-modal-footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
