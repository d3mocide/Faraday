import { findConnector } from '../connectors/library';
import type { EnclosureProject } from '../types/project';

interface BomRow {
  item: string;
  quantity: number;
  category: string;
  notes: string;
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function perimeterMm(project: EnclosureProject): number {
  const { body } = project;
  return body.shape === 'box' ? 2 * (body.outer.length + body.outer.width) : Math.PI * body.outer.diameter;
}

/**
 * Alongside-the-STLs BOM/screw list (DESIGN.md §13 stretch goal): a shopping-list CSV covering
 * what generateEnclosure.ts's CSG pipeline assumes is on hand -- lid screws/inserts, gasket cord,
 * connectors, and printed standoffs -- so it's easy to gather hardware before printing. Same
 * "starter values, verify before buying/printing" spirit as the connector/screw libraries this
 * pulls from.
 */
export function generateBomCsv(project: EnclosureProject): string {
  const { body, features } = project;
  const rows: BomRow[] = [];

  if (body.lid.type === 'screw-boss' && body.lid.screw) {
    const { size, insertType, count } = body.lid.screw;
    rows.push({
      item: `${size} machine screw`,
      quantity: count,
      category: 'Hardware',
      notes: insertType === 'heat-set' ? 'Threads into a heat-set insert in the base boss' : 'Self-taps into the base boss',
    });
    if (insertType === 'heat-set') {
      rows.push({
        item: `${size} heat-set brass insert`,
        quantity: count,
        category: 'Hardware',
        notes: 'Heat-staked into the base bosses before assembly',
      });
    }
  }

  if (body.lid.gasket) {
    rows.push({
      item: 'Gasket cord (O-ring or foam strip)',
      quantity: 1,
      category: 'Seal',
      notes: `~${body.lid.gasket.width}mm cross-section, ~${Math.round(perimeterMm(project))}mm loop length to fill the channel`,
    });
  }

  const connectorCounts = new Map<string, number>();
  for (const feature of features) {
    if (feature.type === 'connector-cutout' && feature.connectorId) {
      connectorCounts.set(feature.connectorId, (connectorCounts.get(feature.connectorId) ?? 0) + 1);
    }
  }
  for (const [connectorId, quantity] of connectorCounts) {
    const entry = findConnector(connectorId);
    rows.push({
      item: entry?.label ?? connectorId,
      quantity,
      category: entry ? `Connector (${entry.category})` : 'Connector',
      notes: entry?.notes ?? '',
    });
  }

  const standoffGroups = new Map<string, { quantity: number; outerDiameter: number; screwHoleDiameter: number }>();
  const countStandoff = (spec: { outerDiameter: number; screwHoleDiameter: number }, quantity: number) => {
    const key = `${spec.outerDiameter}x${spec.screwHoleDiameter}`;
    const existing = standoffGroups.get(key);
    if (existing) existing.quantity += quantity;
    else standoffGroups.set(key, { quantity, outerDiameter: spec.outerDiameter, screwHoleDiameter: spec.screwHoleDiameter });
  };
  for (const feature of features) {
    if (feature.type === 'standoff' && feature.standoff) {
      countStandoff(feature.standoff, 1);
    } else if (feature.type === 'board-mount' && feature.board && feature.board.holes.length > 0) {
      countStandoff(feature.board.standoff, feature.board.holes.length);
    }
  }
  for (const { quantity, outerDiameter, screwHoleDiameter } of standoffGroups.values()) {
    rows.push({
      item: 'PCB standoff (printed with the base)',
      quantity,
      category: 'Printed',
      notes: `Ø${outerDiameter}mm boss, Ø${screwHoleDiameter}mm screw hole -- pick a screw that matches`,
    });
  }

  const header = ['Item', 'Quantity', 'Category', 'Notes'];
  const lines = [header, ...rows.map((r) => [r.item, String(r.quantity), r.category, r.notes])];
  return lines.map((cols) => cols.map(csvEscape).join(',')).join('\n');
}
