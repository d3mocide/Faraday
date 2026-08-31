import type { EnclosureProject } from '../types/project';
import { featureLabel } from './featureLabel';

/** A short, human-readable guess at what changed between two consecutive project snapshots.
 * There's no per-action label recorded anywhere in the undo stack (every one of the ~60 store
 * actions funnels through the same `mutate()`, with no description parameter) -- threading one
 * through every call site would be a much bigger, more invasive change than this feature needs.
 * A shallow structural diff between adjacent snapshots gets most of the value without it: it can't
 * name the exact field that changed, but it can usually say which *part* of the project did. */
export function summarizeHistoryStep(prev: EnclosureProject, next: EnclosureProject): string {
  if (prev.features !== next.features) {
    const added = next.features.find((f) => !prev.features.some((p) => p.id === f.id));
    if (added) return `Added ${featureLabel(added)}`;
    const removed = prev.features.find((f) => !next.features.some((n) => n.id === f.id));
    if (removed) return `Removed ${featureLabel(removed)}`;
    if (prev.features.length === next.features.length) {
      const changed = next.features.find((f, i) => f !== prev.features[i]);
      return changed ? `Edited ${featureLabel(changed)}` : 'Edited features';
    }
    return 'Edited features';
  }
  if (prev.body !== next.body) {
    if (prev.body.shape !== next.body.shape) return 'Changed body shape';
    if (prev.body.lid !== next.body.lid) return 'Changed lid settings';
    if (prev.body.shape === 'box' && next.body.shape === 'box' && prev.body.panels !== next.body.panels) {
      return 'Changed slide-in panels';
    }
    if (prev.body.wallThickness !== next.body.wallThickness) return 'Changed wall thickness';
    return 'Changed body dimensions';
  }
  if (prev.name !== next.name) return 'Renamed project';
  if (prev.units !== next.units) return 'Changed units';
  if (prev.manufacturingProfile !== next.manufacturingProfile) return 'Changed print profile';
  if (prev.tessellation !== next.tessellation) return 'Changed render quality';
  return 'Edited project';
}

export interface HistoryEntry {
  project: EnclosureProject;
  summary: string;
  isCurrent: boolean;
}

/** Builds the full undo/redo timeline (oldest first) with a summary label per step, given the
 * live `past`/`project`/`future` triple from the store. */
export function buildHistoryTimeline(
  past: EnclosureProject[],
  project: EnclosureProject,
  future: EnclosureProject[],
): HistoryEntry[] {
  const timeline = [...past, project, ...future];
  const currentIndex = past.length;
  return timeline.map((entry, i) => ({
    project: entry,
    isCurrent: i === currentIndex,
    summary: i === 0 ? 'Started here' : summarizeHistoryStep(timeline[i - 1], entry),
  }));
}
