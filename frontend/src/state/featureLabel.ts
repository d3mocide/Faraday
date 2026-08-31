import { findConnector } from '../connectors/library';
import type { Feature } from '../types/project';

/** Human-readable name for a feature, used by the Layers list, selection header, and history
 * summaries -- one source of truth so all three describe the same feature the same way. */
export function featureLabel(feature: Feature): string {
  if (feature.type === 'standoff') return 'Standoff';
  if (feature.type === 'board-mount') return 'Board mount';
  if (feature.type === 'vent') return 'Vent';
  if (feature.type === 'custom-hole') return 'Custom hole';
  if (feature.type === 'external-mount') {
    return feature.mount?.style === 'boss' ? 'External boss' : 'Mounting flange';
  }
  if (feature.type === 'fan-mount') return `${feature.fan?.size ?? ''}mm fan`;
  if (feature.type === 'support-pad') return 'Support pad';
  if (feature.type === 'connector-cutout' && feature.connectorId) {
    return findConnector(feature.connectorId)?.label ?? feature.connectorId;
  }
  return feature.type;
}
