import { useState, useMemo } from 'react';
import { CONNECTOR_LIBRARY } from '../connectors/library';
import { FAN_PRESETS } from '../csg/fanLibrary';
import { BOARD_MOUNT_PRESETS } from '../presets/boardMounts';
import type { ConnectorCategory, ConnectorLibraryEntry } from '../types/project';

export type ArmedFeatureTemplate =
  | { type: 'connector-cutout'; connectorId: string; label: string }
  | { type: 'standoff'; label: string }
  | { type: 'board-mount'; label: string; boardPresetId?: string }
  | { type: 'vent'; label: string }
  | { type: 'custom-hole'; label: string }
  | { type: 'external-mount'; label: string; mountStyle: 'flange' | 'boss' }
  | { type: 'fan-mount'; label: string; fanSize: number }
  | { type: 'support-pad'; label: string }
  | { type: 'grip-ribs'; label: string };

interface FeaturePaletteProps {
  armed: ArmedFeatureTemplate | null;
  onArm: (template: ArmedFeatureTemplate) => void;
  onDisarm: () => void;
}

type FilterCategory = 'all' | 'mounting' | 'boards' | 'fans' | 'openings' | ConnectorCategory;

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

function CategoryIcon({ category }: { category: FilterCategory }) {
  switch (category) {
    case 'all':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case 'fans':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 12c0-4 1.5-6 3.5-6s2 2.5 0 4.5M12 12c4 0 6 1.5 6 3.5s-2.5 2-4.5 0M12 12c0 4-1.5 6-3.5 6s-2-2.5 0-4.5M12 12c-4 0-6-1.5-6-3.5s2.5-2 4.5 0" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      );
    case 'boards':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <circle cx="16" cy="8" r="1.5" fill="currentColor" />
          <circle cx="8" cy="16" r="1.5" fill="currentColor" />
          <circle cx="16" cy="16" r="1.5" fill="currentColor" />
          <rect x="10" y="10" width="4" height="4" rx="1" />
        </svg>
      );
    case 'mounting':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v18M7 7h10M5 12h14M7 17h10" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case 'openings':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M7 8h10M7 12h10M7 16h10" />
        </svg>
      );
    case 'usb':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v14M12 12l4 4M12 12l-4 4" />
          <rect x="10" y="2" width="4" height="4" fill="currentColor" />
          <circle cx="16" cy="16" r="2" fill="currentColor" />
          <polygon points="6,14 8,18 4,18" fill="currentColor" />
          <circle cx="12" cy="20" r="1.5" />
        </svg>
      );
    case 'video':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 18v3" />
          <circle cx="12" cy="11" r="2.5" />
        </svg>
      );
    case 'network':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <path d="M9 16v4M15 16v4M7 8h10M9 12h6" />
        </svg>
      );
    case 'audio':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" fill="currentColor" />
          <circle cx="18" cy="16" r="3" fill="currentColor" />
        </svg>
      );
    case 'power':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'rf':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'antenna':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="22" x2="12" y2="9" />
          <path d="M5 4l7 5 7-5" />
          <circle cx="12" cy="9" r="2" fill="currentColor" />
        </svg>
      );
    case 'misc':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      );
    default:
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

function getDimensionBadge(entry: ConnectorLibraryEntry): string {
  if (entry.holeShape === 'circle') return `Ø ${entry.diameter ?? 0}mm`;
  if (entry.holeShape === 'dshape') return `D ${entry.diameter ?? 0}mm`;
  if (entry.width && entry.height) return `${entry.width}×${entry.height}mm`;
  return 'Cutout';
}

const RAIL_CATEGORIES: { id: FilterCategory; label: string }[] = [
  { id: 'all', label: 'All Parts' },
  { id: 'mounting', label: 'Mounts & Bosses' },
  { id: 'boards', label: 'Board Mounts' },
  { id: 'openings', label: 'Vents & Holes' },
  { id: 'fans', label: 'Cooling Fans' },
  { id: 'usb', label: 'USB Ports' },
  { id: 'rf', label: 'RF Ports' },
  { id: 'video', label: 'Video (HDMI/DP)' },
  { id: 'network', label: 'Network (RJ45)' },
  { id: 'audio', label: 'Audio (3.5mm)' },
  { id: 'power', label: 'Power (DC/IEC)' },
  { id: 'antenna', label: 'Antenna Mounts' },
  { id: 'misc', label: 'Misc Connectors' },
];

export function FeaturePalette({ armed, onArm, onDisarm }: FeaturePaletteProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');

  const query = search.trim().toLowerCase();

  const matchesQuery = (label: string, notes?: string, badge?: string) => {
    if (!query) return true;
    return (
      label.toLowerCase().includes(query) ||
      (notes && notes.toLowerCase().includes(query)) ||
      (badge && badge.toLowerCase().includes(query))
    );
  };

  const filteredConnectors = useMemo(() => {
    return CONNECTOR_LIBRARY.filter((entry) => {
      const matchCat = activeCategory === 'all' || activeCategory === entry.category;
      const badge = getDimensionBadge(entry);
      const matchText =
        !query ||
        entry.label.toLowerCase().includes(query) ||
        (entry.notes && entry.notes.toLowerCase().includes(query)) ||
        badge.toLowerCase().includes(query);
      return matchCat && matchText;
    });
  }, [activeCategory, query]);

  const showMounting =
    (activeCategory === 'all' || activeCategory === 'mounting') &&
    (matchesQuery('Standoff (PCB mount)', 'PCB mount standoffs', 'M2.2/M3') ||
      matchesQuery('Board Mount', 'outline + mounting holes', 'PCB Grid') ||
      matchesQuery('Mounting Flange', 'external wall mount tab ear slot keyhole', 'Wall Tab') ||
      matchesQuery('External Boss', 'external standoff post foot spacer outside', 'Post') ||
      matchesQuery('Support Pad', 'blind pillar prop unsupported cantilever board edge', 'Prop'));

  const filteredBoardPresets =
    activeCategory === 'all' || activeCategory === 'mounting' || activeCategory === 'boards'
      ? BOARD_MOUNT_PRESETS.filter((preset) => matchesQuery(preset.label, preset.notes, preset.badge))
      : [];

  const showOpenings =
    (activeCategory === 'all' || activeCategory === 'openings') &&
    (matchesQuery('Vent Panel', 'slots/honeycomb cooling', 'Vent') ||
      matchesQuery('Custom Hole', 'circle/rect custom opening', 'Custom'));

  const filteredFans =
    activeCategory === 'all' || activeCategory === 'openings' || activeCategory === 'fans'
      ? FAN_PRESETS.filter((preset) =>
          matchesQuery(
            `${preset.size}mm Fan`,
            `axial fan grille cooling exhaust intake ${preset.screw} ${preset.pitch}mm pitch`,
            `${preset.size}×${preset.size}mm`,
          ),
        )
      : [];

  if (isCollapsed) {
    return (
      <aside className="feature-palette collapsed" aria-label="Feature Palette Toolbar">
        <button
          type="button"
          className="palette-rail-toggle"
          onClick={() => setIsCollapsed(false)}
          title="Expand Feature Palette"
          aria-label="Expand Feature Palette"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <div className="palette-rail-divider" />

        <div className="palette-rail-items">
          {RAIL_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                className={`rail-category-btn ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setIsCollapsed(false);
                }}
                title={`${cat.label} (Click to open)`}
                aria-label={cat.label}
              >
                <CategoryIcon category={cat.id} />
                <span className="rail-indicator" />
              </button>
            );
          })}
        </div>

        {armed && (
          <div className="rail-armed-indicator" title={`Placing: ${armed.label}`} onClick={onDisarm}>
            <span className="armed-dot" />
          </div>
        )}
      </aside>
    );
  }

  return (
    <div className="feature-palette">
      <div className="palette-header">
        <div className="palette-title-group">
          <h3>Features</h3>
          <span className="palette-count">{CONNECTOR_LIBRARY.length + BOARD_MOUNT_PRESETS.length + FAN_PRESETS.length + 7}</span>
        </div>
        <button
          type="button"
          className="palette-collapse-btn"
          onClick={() => setIsCollapsed(true)}
          title="Collapse to Rail"
          aria-label="Collapse Feature Palette"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <div className="palette-search">
        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search features..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="clear-search" onClick={() => setSearch('')} title="Clear search">
            <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        )}
      </div>

      <div className="category-tabs">
        <button
          type="button"
          className={activeCategory === 'all' ? 'tab-chip active' : 'tab-chip'}
          onClick={() => setActiveCategory('all')}
        >
          All
        </button>
        <button
          type="button"
          className={activeCategory === 'mounting' ? 'tab-chip active' : 'tab-chip'}
          onClick={() => setActiveCategory('mounting')}
        >
          Mounting
        </button>
        <button
          type="button"
          className={activeCategory === 'boards' ? 'tab-chip active' : 'tab-chip'}
          onClick={() => setActiveCategory('boards')}
        >
          Boards
        </button>
        <button
          type="button"
          className={activeCategory === 'openings' ? 'tab-chip active' : 'tab-chip'}
          onClick={() => setActiveCategory('openings')}
        >
          Openings
        </button>
        <button
          type="button"
          className={activeCategory === 'fans' ? 'tab-chip active' : 'tab-chip'}
          onClick={() => setActiveCategory('fans')}
        >
          Fans
        </button>
        {(['usb', 'rf', 'video', 'network', 'audio', 'power', 'antenna', 'misc'] as ConnectorCategory[]).map(
          (cat) => (
            <button
              key={cat}
              type="button"
              className={activeCategory === cat ? 'tab-chip active' : 'tab-chip'}
              onClick={() => setActiveCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ),
        )}
      </div>

      {armed && (
        <div className="palette-armed-hint">
          <div className="armed-title">
            <span className="armed-dot" />
            <span>Placing <strong>{armed.label}</strong></span>
          </div>
          <p className="armed-desc">
            Click target face in viewport to place.
            {(armed.type === 'standoff' || armed.type === 'board-mount' || armed.type === 'support-pad') &&
              ' Mounts to interior floor.'}
          </p>
          <button type="button" className="disarm-button" onClick={onDisarm}>
            Cancel Placement
          </button>
        </div>
      )}

      <div className="palette-content">
        {showMounting && (
          <section className="palette-group">
            <div className="group-title">
              <CategoryIcon category="mounting" />
              <span>Mounting</span>
            </div>
            <div className="card-grid">
              <button
                type="button"
                className={armed?.type === 'standoff' ? 'palette-card armed' : 'palette-card'}
                onClick={() => onArm({ type: 'standoff', label: 'Standoff' })}
              >
                <div className="card-top">
                  <span className="card-name">Standoff</span>
                  <span className="dim-badge">PCB Mount</span>
                </div>
                <span className="card-note">Single interior PCB mounting pillar</span>
              </button>
              <button
                type="button"
                className={armed?.type === 'board-mount' ? 'palette-card armed' : 'palette-card'}
                onClick={() => onArm({ type: 'board-mount', label: 'Board Mount' })}
              >
                <div className="card-top">
                  <span className="card-name">Board Mount</span>
                  <span className="dim-badge">4-Hole Grid</span>
                </div>
                <span className="card-note">PCB outline + 4 corner standoffs</span>
              </button>
              <button
                type="button"
                className={armed?.type === 'support-pad' ? 'palette-card armed' : 'palette-card'}
                onClick={() => onArm({ type: 'support-pad', label: 'Support Pad' })}
              >
                <div className="card-top">
                  <span className="card-name">Support Pad</span>
                  <span className="dim-badge">Prop</span>
                </div>
                <span className="card-note">Blind floor pillar under an unsupported board edge</span>
              </button>
              <button
                type="button"
                className={
                  armed?.type === 'external-mount' && armed.mountStyle === 'flange'
                    ? 'palette-card armed'
                    : 'palette-card'
                }
                onClick={() =>
                  onArm({ type: 'external-mount', mountStyle: 'flange', label: 'Mounting Flange' })
                }
              >
                <div className="card-top">
                  <span className="card-name">Mounting Flange</span>
                  <span className="dim-badge">Wall Tab</span>
                </div>
                <span className="card-note">External ear with a slotted screw hole</span>
              </button>
              <button
                type="button"
                className={
                  armed?.type === 'external-mount' && armed.mountStyle === 'boss'
                    ? 'palette-card armed'
                    : 'palette-card'
                }
                onClick={() =>
                  onArm({ type: 'external-mount', mountStyle: 'boss', label: 'External Boss' })
                }
              >
                <div className="card-top">
                  <span className="card-name">External Boss</span>
                  <span className="dim-badge">Post</span>
                </div>
                <span className="card-note">Outside standoff: foot, spacer or bolt pillar</span>
              </button>
            </div>
          </section>
        )}

        {filteredBoardPresets.length > 0 && (
          <section className="palette-group">
            <div className="group-title">
              <CategoryIcon category="boards" />
              <span>Boards ({filteredBoardPresets.length})</span>
            </div>
            <div className="card-grid">
              {filteredBoardPresets.map((preset) => {
                const isArmed =
                  armed?.type === 'board-mount' && armed.boardPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={isArmed ? 'palette-card armed' : 'palette-card'}
                    title={preset.notes}
                    onClick={() =>
                      onArm({ type: 'board-mount', boardPresetId: preset.id, label: preset.label })
                    }
                  >
                    <div className="card-top">
                      <span className="card-name">{preset.label}</span>
                      <span className="dim-badge">{preset.badge}</span>
                    </div>
                    <span className="card-note">{preset.notes}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {showOpenings && (
          <section className="palette-group">
            <div className="group-title">
              <CategoryIcon category="openings" />
              <span>Openings</span>
            </div>
            <div className="card-grid">
              <button
                type="button"
                className={armed?.type === 'vent' ? 'palette-card armed' : 'palette-card'}
                onClick={() => onArm({ type: 'vent', label: 'Vent Panel' })}
              >
                <div className="card-top">
                  <span className="card-name">Vent Panel</span>
                  <span className="dim-badge">Cooling</span>
                </div>
                <span className="card-note">Slotted/honeycomb ventilation grid</span>
              </button>
              <button
                type="button"
                className={armed?.type === 'custom-hole' ? 'palette-card armed' : 'palette-card'}
                onClick={() => onArm({ type: 'custom-hole', label: 'Custom Hole' })}
              >
                <div className="card-top">
                  <span className="card-name">Custom Hole</span>
                  <span className="dim-badge">Custom</span>
                </div>
                <span className="card-note">Custom circular or rectangular cutout</span>
              </button>
              <button
                type="button"
                className={armed?.type === 'grip-ribs' ? 'palette-card armed' : 'palette-card'}
                onClick={() => onArm({ type: 'grip-ribs', label: 'Grip Ribs' })}
              >
                <div className="card-top">
                  <span className="card-name">Grip Ribs</span>
                  <span className="dim-badge">Tactical</span>
                </div>
                <span className="card-note">Parallel recessed tactile grip slots</span>
              </button>
            </div>
          </section>
        )}

        {filteredFans.length > 0 && (
          <section className="palette-group">
            <div className="group-title">
              <CategoryIcon category="fans" />
              <span>Fans ({filteredFans.length})</span>
            </div>
            <div className="card-grid">
              {filteredFans.map((preset) => {
                const isArmed = armed?.type === 'fan-mount' && armed.fanSize === preset.size;
                return (
                  <button
                    key={preset.size}
                    type="button"
                    className={isArmed ? 'palette-card armed' : 'palette-card'}
                    onClick={() =>
                      onArm({ type: 'fan-mount', fanSize: preset.size, label: `${preset.size}mm Fan` })
                    }
                  >
                    <div className="card-top">
                      <span className="card-name">{preset.size}mm Fan</span>
                      <span className="dim-badge">
                        {preset.size}×{preset.size}mm
                      </span>
                    </div>
                    <span className="card-note">
                      Ring grille + {preset.pitch}mm screw pitch ({preset.screw})
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {filteredConnectors.length > 0 && (
          <section className="palette-group">
            <div className="group-title">
              <CategoryIcon category={activeCategory === 'all' ? 'usb' : activeCategory} />
              <span>Connectors ({filteredConnectors.length})</span>
            </div>
            <div className="card-grid">
              {filteredConnectors.map((entry) => {
                const badge = getDimensionBadge(entry);
                const isArmed = armed?.type === 'connector-cutout' && armed.connectorId === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={isArmed ? 'palette-card armed' : 'palette-card'}
                    title={entry.notes}
                    onClick={() =>
                      onArm({ type: 'connector-cutout', connectorId: entry.id, label: entry.label })
                    }
                  >
                    <div className="card-top">
                      <span className="card-name">{entry.label}</span>
                      <span className="dim-badge">{badge}</span>
                    </div>
                    <span className="card-note">{entry.notes}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!showMounting &&
          !showOpenings &&
          filteredBoardPresets.length === 0 &&
          filteredFans.length === 0 &&
          filteredConnectors.length === 0 && (
          <div className="palette-empty">
            <p>No features match "{search}"</p>
            <button type="button" onClick={() => setSearch('')}>
              Clear search
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

