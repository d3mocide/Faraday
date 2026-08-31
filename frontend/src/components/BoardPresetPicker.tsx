import { useEffect, useMemo, useRef, useState } from 'react';
import { BOARD_PRESETS, type BoardPreset } from '../presets/boards';
import { buildPresetFeatures } from '../state/featureFactory';
import { useProjectStore } from '../state/projectStore';
import { InfoTooltip } from './InfoTooltip';

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

function presetSummary(preset: BoardPreset): string {
  const { length, width, height } = preset.body.outer;
  const details: string[] = [];
  if (preset.boardMount) details.push('mount pattern');
  if (hasIoCutouts(preset)) details.push(`${preset.io!.length} I/O features`);
  if (details.length === 0) details.push('case dimensions only');
  return `${length} × ${width} × ${height}mm case · ${details.join(' + ')}`;
}

function presetDetails(preset: BoardPreset): string {
  const { length, width, height } = preset.body.outer;
  const details = [`${length} × ${width} × ${height}mm case.`];
  if (preset.boardMount?.cornerGuides) details.push('Friction-fit guides; no PCB fasteners.');
  else if (preset.boardMount) details.push('Documented mount pattern.');
  if (hasIoCutouts(preset)) {
    const count = preset.io!.length;
    details.push(`${count} modeled ${count === 1 ? 'feature' : 'features'}.`);
  }
  if (preset.body.lidType === 'friction-lip') details.push('Friction-lip lid.');
  details.push('Verify fit before printing.');
  return details.join(' ');
}

export function BoardPresetPicker({ onClose }: BoardPresetPickerProps) {
  const applyBoardPreset = useProjectStore((s) => s.applyBoardPreset);
  const [tab, setTab] = useState<PresetTab>('complete');
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const tabCounts = useMemo(
    () => ({
      complete: BOARD_PRESETS.filter(hasIoCutouts).length,
      'case-only': BOARD_PRESETS.filter((preset) => !hasIoCutouts(preset)).length,
    }),
    [],
  );

  const visiblePresets = useMemo(
    () => {
      const normalizedQuery = query.trim().toLowerCase();
      return BOARD_PRESETS.filter((preset) => {
        const matchesTab = tab === 'complete' ? hasIoCutouts(preset) : !hasIoCutouts(preset);
        const matchesQuery =
          normalizedQuery.length === 0 ||
          preset.label.toLowerCase().includes(normalizedQuery) ||
          preset.notes.toLowerCase().includes(normalizedQuery);
        return matchesTab && matchesQuery;
      });
    },
    [query, tab],
  );

  const handlePick = (presetId: string) => {
    const preset = BOARD_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    applyBoardPreset(preset.body, buildPresetFeatures(preset));
    onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal preset-modal" role="dialog" aria-modal="true" aria-labelledby="preset-picker-title">
        <div className="preset-modal-header">
          <div>
            <h3 id="preset-picker-title">Choose a starting point</h3>
            <p className="preset-modal-hint">
              Applies the case dimensions and listed features, replacing the current features. Verify against your
              actual hardware before printing.
            </p>
          </div>
          <button type="button" className="preset-modal-close" onClick={onClose} aria-label="Close presets">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <label className="preset-search">
          <span className="visually-hidden">Search presets</span>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.3" />
            <path d="m9.8 9.8 3.4 3.4" strokeLinecap="round" />
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search boards and features"
          />
        </label>
        <div className="preset-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`preset-panel-${t.id}`}
              className={`preset-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              <span className="preset-tab-count">{tabCounts[t.id]}</span>
            </button>
          ))}
        </div>
        <div id={`preset-panel-${tab}`} role="tabpanel" className="preset-panel">
          {visiblePresets.length > 0 ? (
            <ul className="preset-list">
              {visiblePresets.map((preset) => (
                <li key={preset.id}>
                  {/* The details button is a sibling, not a child, of the pick button. */}
                  <button type="button" className="preset-pick" onClick={() => handlePick(preset.id)}>
                    <span className="preset-label">{preset.label}</span>
                    <span className="preset-summary">{presetSummary(preset)}</span>
                  </button>
                  <span className="preset-info-anchor">
                    <InfoTooltip label={`Setup summary for ${preset.label}`}>{presetDetails(preset)}</InfoTooltip>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="preset-empty">No {tab === 'complete' ? 'complete-board' : 'case-only'} presets match “{query}”.</p>
          )}
        </div>
        <div className="preset-modal-footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
