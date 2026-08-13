import { useState, useEffect } from 'react';
import { CONNECTOR_LIBRARY } from '../connectors/library';
import { BOARD_PRESETS } from '../presets/boards';
import { useProjectStore } from '../state/projectStore';
import type { ArmedFeatureTemplate } from './FeaturePalette';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onArmFeature: (template: ArmedFeatureTemplate) => void;
}

export function CommandPalette({ isOpen, onClose, onArmFeature }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const applyBoardPreset = useProjectStore((s) => s.applyBoardPreset);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();

  const connectorActions = CONNECTOR_LIBRARY.filter(
    (c) => !q || c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
  ).map((c) => ({
    id: `conn-${c.id}`,
    label: `Add Cutout: ${c.label}`,
    category: 'Connectors',
    action: () => {
      onArmFeature({ type: 'connector-cutout', connectorId: c.id, label: c.label });
      onClose();
    },
  }));

  const boardActions = BOARD_PRESETS.filter(
    (b) => !q || b.label.toLowerCase().includes(q)
  ).map((b) => ({
    id: `board-${b.id}`,
    label: `Load Board Preset: ${b.label}`,
    category: 'Board Presets',
    action: () => {
      applyBoardPreset(b.body);
      onClose();
    },
  }));

  const quickActions = [
    {
      id: 'arm-standoff',
      label: 'Add Standoff (PCB Mount)',
      category: 'Mounting',
      action: () => {
        onArmFeature({ type: 'standoff', label: 'Standoff' });
        onClose();
      },
    },
    {
      id: 'arm-vent',
      label: 'Add Vent Cooling Panel',
      category: 'Openings',
      action: () => {
        onArmFeature({ type: 'vent', label: 'Vent' });
        onClose();
      },
    },
  ].filter((a) => !q || a.label.toLowerCase().includes(q));

  const allActions = [...quickActions, ...connectorActions, ...boardActions];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="command-palette-modal" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-wrapper">
          <svg className="search-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10 10l4 4" />
          </svg>
          <input
            type="text"
            className="command-palette-input"
            placeholder="Type a command or search connectors & presets... (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="palette-results-list">
          {allActions.length === 0 ? (
            <div className="palette-empty-text">No matching commands found.</div>
          ) : (
            allActions.map((item, idx) => (
              <div
                key={item.id}
                className={`palette-item ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="item-label">{item.label}</span>
                <span className="item-category-badge">{item.category}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
