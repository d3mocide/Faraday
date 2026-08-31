import { useProjectStore } from '../state/projectStore';
import { buildHistoryTimeline } from '../state/historySummary';

/** The undo/redo stack as a clickable list, newest first. Clicking any entry jumps straight to
 * it (via the store's jumpToHistory, one atomic repositioning of past/future) rather than
 * replaying undo()/redo() one step at a time. */
export function HistoryPanel() {
  const past = useProjectStore((s) => s.past);
  const project = useProjectStore((s) => s.project);
  const future = useProjectStore((s) => s.future);
  const jumpToHistory = useProjectStore((s) => s.jumpToHistory);

  const timeline = buildHistoryTimeline(past, project, future);
  const currentIndex = past.length;
  // Oldest-first internally (index 0 = furthest back); shown newest-first, so reverse for display
  // only -- `i` (and the undo/redo distance derived from it) stays keyed to the real timeline.
  const rows = timeline.map((entry, i) => ({ entry, stepsFromCurrent: currentIndex - i }));

  return (
    <div className="history-panel">
      <p className="field-hint">
        Every edit you make, newest at the top. Click an entry to jump straight to it -- same as
        pressing Undo/Redo that many times, and jumping forward again is still possible until you
        make a new edit.
      </p>
      <ul className="history-list">
        {[...rows].reverse().map(({ entry, stepsFromCurrent }, i) => (
          <li key={i}>
            <button
              type="button"
              className={entry.isCurrent ? 'history-item current' : 'history-item'}
              onClick={() => jumpToHistory(entry.project)}
              disabled={entry.isCurrent}
            >
              <span className="history-dot" aria-hidden="true" />
              <span className="history-summary">{entry.summary}</span>
              {entry.isCurrent ? (
                <span className="history-badge">Current</span>
              ) : (
                <span className="history-steps">
                  {stepsFromCurrent > 0 ? `${stepsFromCurrent} back` : `${-stepsFromCurrent} forward`}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
