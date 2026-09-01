import type { EnclosureProject } from '../types/project';
import { featureLabel } from './featureLabel';

/** Which part of the project a history step touched -- drives the timeline's per-category color
 * and icon in HistoryPanel. 'start' is only ever the first (oldest) entry. */
export type HistoryCategory = 'start' | 'feature' | 'body' | 'lid' | 'project';

export interface HistoryStep {
  summary: string;
  category: HistoryCategory;
}

/** A short, human-readable guess at what changed between two consecutive project snapshots.
 * There's no per-action label recorded anywhere in the undo stack (every one of the ~60 store
 * actions funnels through the same `mutate()`, with no description parameter) -- threading one
 * through every call site would be a much bigger, more invasive change than this feature needs.
 * A shallow structural diff between adjacent snapshots gets most of the value without it: it can't
 * name the exact field that changed, but it can usually say which *part* of the project did. */
export function summarizeHistoryStep(prev: EnclosureProject, next: EnclosureProject): HistoryStep {
  if (prev.features !== next.features) {
    const added = next.features.find((f) => !prev.features.some((p) => p.id === f.id));
    if (added) return { summary: `Added ${featureLabel(added)}`, category: 'feature' };
    const removed = prev.features.find((f) => !next.features.some((n) => n.id === f.id));
    if (removed) return { summary: `Removed ${featureLabel(removed)}`, category: 'feature' };
    if (prev.features.length === next.features.length) {
      const changed = next.features.find((f, i) => f !== prev.features[i]);
      return { summary: changed ? `Edited ${featureLabel(changed)}` : 'Edited features', category: 'feature' };
    }
    return { summary: 'Edited features', category: 'feature' };
  }
  if (prev.body !== next.body) {
    if (prev.body.shape !== next.body.shape) return { summary: 'Changed body shape', category: 'body' };
    if (prev.body.lid !== next.body.lid) return { summary: 'Changed lid settings', category: 'lid' };
    if (prev.body.shape === 'box' && next.body.shape === 'box' && prev.body.panels !== next.body.panels) {
      return { summary: 'Changed slide-in panels', category: 'body' };
    }
    if (prev.body.wallThickness !== next.body.wallThickness) {
      return { summary: 'Changed wall thickness', category: 'body' };
    }
    return { summary: 'Changed body dimensions', category: 'body' };
  }
  if (prev.name !== next.name) return { summary: 'Renamed project', category: 'project' };
  if (prev.units !== next.units) return { summary: 'Changed units', category: 'project' };
  if (prev.manufacturingProfile !== next.manufacturingProfile) {
    return { summary: 'Changed print profile', category: 'project' };
  }
  if (prev.tessellation !== next.tessellation) return { summary: 'Changed render quality', category: 'project' };
  return { summary: 'Edited project', category: 'project' };
}

export interface HistoryEntry {
  project: EnclosureProject;
  summary: string;
  category: HistoryCategory;
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
  return timeline.map((entry, i) => {
    const step = i === 0 ? { summary: 'Started here', category: 'start' as const } : summarizeHistoryStep(timeline[i - 1], entry);
    return { project: entry, isCurrent: i === currentIndex, ...step };
  });
}
