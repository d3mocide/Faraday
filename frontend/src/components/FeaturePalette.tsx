import { useState, useMemo } from 'react';
import { CONNECTOR_LIBRARY } from '../connectors/library';
import type { ConnectorCategory, ConnectorLibraryEntry } from '../types/project';

export type ArmedFeatureTemplate =
  | { type: 'connector-cutout'; connectorId: string; label: string }
  | { type: 'standoff'; label: string }
  | { type: 'board-mount'; label: string }
  | { type: 'vent'; label: string }
  | { type: 'custom-hole'; label: string };

interface FeaturePaletteProps {
  armed: ArmedFeatureTemplate | null;
  onArm: (template: ArmedFeatureTemplate) => void;
  onDisarm: () => void;
}

type FilterCategory = 'all' | 'mounting' | 'openings' | ConnectorCategory;

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
    case 'mounting':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M17 5H7M19 12H5M17 19H7" />
        </svg>
      );
    case 'openings':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M15 15h2v2h-2z" />
        </svg>
      );
    case 'usb':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v10M12 12l4 4M12 12l-4 4" />
          <rect x="10" y="2" width="4" height="4" />
          <circle cx="16" cy="16" r="2" />
          <polygon points="6,14 8,18 4,18" />
        </svg>
      );
    case 'video':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M8 20h8M12 17v3" />
        </svg>
      );
    case 'network':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <path d="M9 18v2M15 18v2M7 10h10" />
        </svg>
      );
    case 'audio':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case 'power':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'rf':
    case 'antenna':
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
          <path d="M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24" />
        </svg>
      );
    default:
      return (
        <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
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

export function FeaturePalette({ armed, onArm, onDisarm }: FeaturePaletteProps) {
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
      matchesQuery('Board Mount', 'outline + mounting holes', 'PCB Grid'));

  const showOpenings =
    (activeCategory === 'all' || activeCategory === 'openings') &&
    (matchesQuery('Vent Panel', 'slots/honeycomb cooling', 'Vent') ||
      matchesQuery('Custom Hole', 'circle/rect custom opening', 'Custom'));

  return (
    <div className="feature-palette">
      <div className="palette-header">
        <h3>Features</h3>
        <span className="palette-count">{CONNECTOR_LIBRARY.length + 4} parts</span>
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
          <button type="button" className="clear-search" onClick={() => setSearch('')}>
            ×
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
          className={activeCategory === 'openings' ? 'tab-chip active' : 'tab-chip'}
          onClick={() => setActiveCategory('openings')}
        >
          Openings
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
            {(armed.type === 'standoff' || armed.type === 'board-mount') &&
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

        {!showMounting && !showOpenings && filteredConnectors.length === 0 && (
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

