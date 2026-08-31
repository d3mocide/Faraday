import { useEffect, useState } from 'react';
import type { DesignCheckFinding } from '../state/designChecks';

interface DesignChecksTrayProps {
  findings: readonly DesignCheckFinding[];
  onSelectFeature: (id: string | null) => void;
}

export function DesignChecksTray({ findings, onSelectFeature }: DesignChecksTrayProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (findings.length === 0) setExpanded(false);
  }, [findings.length]);

  if (findings.length === 0) return null;

  const [primaryFinding] = findings;
  const summary =
    findings.length === 1
      ? primaryFinding.title
      : `${primaryFinding.title} and ${findings.length - 1} more`;

  return (
    <section className={`design-checks-tray ${expanded ? 'expanded' : ''}`} aria-label="Design checks" aria-live="polite">
      <button
        type="button"
        className="design-checks-summary"
        aria-expanded={expanded}
        aria-controls="design-checks-list"
        onClick={() => setExpanded((value) => !value)}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M8 2.2 14 13H2L8 2.2Z" />
          <path d="M8 5.5v3.8M8 11.4h.01" strokeLinecap="round" />
        </svg>
        <span className="design-checks-label">Design checks</span>
        <span className="design-checks-count">{findings.length}</span>
        <span className="design-checks-message">{summary}</span>
        <svg
          className="design-checks-chevron"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div id="design-checks-list" className="design-checks-list">
          {findings.map((finding) => (
            <button
              key={finding.id}
              type="button"
              className="design-check-item"
              disabled={!finding.featureId}
              onClick={() => {
                if (!finding.featureId) return;
                onSelectFeature(finding.featureId);
                setExpanded(false);
              }}
            >
              <span className="design-check-title">{finding.title}</span>
              <span className="design-check-detail">{finding.detail}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
