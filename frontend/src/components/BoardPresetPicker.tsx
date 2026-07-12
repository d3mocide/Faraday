import { BOARD_PRESETS } from '../presets/boards';
import { useProjectStore } from '../state/projectStore';

interface BoardPresetPickerProps {
  onClose: () => void;
}

export function BoardPresetPicker({ onClose }: BoardPresetPickerProps) {
  const applyBoardPreset = useProjectStore((s) => s.applyBoardPreset);

  const handlePick = (presetId: string) => {
    const preset = BOARD_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    applyBoardPreset(preset.body, preset.boardMount);
    onClose();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal preset-modal">
        <h3>Start from a board</h3>
        <p className="preset-modal-hint">
          Sets body size, wall thickness, and split height to fit the board; clears any placed
          features. Starter dimensions -- verify against your actual hardware.
        </p>
        <ul className="preset-list">
          {BOARD_PRESETS.map((preset) => (
            <li key={preset.id}>
              <button type="button" onClick={() => handlePick(preset.id)}>
                <span className="preset-label">{preset.label}</span>
                <span className="preset-notes">{preset.notes}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
