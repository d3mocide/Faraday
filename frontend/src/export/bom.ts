import { findConnector } from '../connectors/library';
import { effectiveSplitHeight } from '../csg/lidSplit';
import { counterboreDepth } from '../csg/primitives';
import { SCREW_HOLE_SPECS } from '../csg/screwLibrary';
import type { EnclosureProject, ScrewSpec } from '../types/project';

interface BomRow {
  item: string;
  quantity: number;
  category: string;
  notes: string;
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Length of lid screw to buy: what it has to pass through (the lid, less any counterbore the head
 * drops into) plus how far it engages the column below, rounded up to the next even millimetre --
 * screws come in 2mm steps and a slightly long screw bottoming out is the failure this rounding
 * direction risks, so engagement is deliberately kept a hair short of the column.
 */
function screwLengthMm(project: EnclosureProject, screw: ScrewSpec): number {
  const { body } = project;
  const outerH = body.shape === 'wedge' ? body.outer.heightBack : body.outer.height;
  const splitHeight = effectiveSplitHeight(body);
  const lidThickness = Math.max(outerH - splitHeight, 0.5);
  // Interior columns sit under the lid's top slab; exterior ones are solid to the top.
  const solidTop =
    screw.placement === 'exterior' ? lidThickness : Math.min(lidThickness, body.wallThickness);
  const through = lidThickness - counterboreDepth(screw, solidTop);
  const columnHeight = Math.min(screw.columnHeight ?? splitHeight, splitHeight);
  const engagement =
    screw.insertType === 'heat-set'
      ? SCREW_HOLE_SPECS[screw.size].heatSetDepth
      : Math.max(Math.min(columnHeight - 1.5, 8), 2);
  return Math.ceil((through + engagement) / 2) * 2;
}

function perimeterMm(project: EnclosureProject): number {
  const { body } = project;
  if (body.shape === 'box' || body.shape === 'stadium' || body.shape === 'wedge') {
    return 2 * (body.outer.length + body.outer.width);
  }
  if (body.shape === 'hexagon' || body.shape === 'octagon') {
    return 2 * Math.PI * body.outer.radius;
  }
  return Math.PI * body.outer.diameter;
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
    const screw = body.lid.screw;
    const { size, insertType, count } = screw;
    rows.push({
      item: `${size}x${screwLengthMm(project, screw)}mm machine screw`,
      quantity: count,
      category: 'Hardware',
      notes:
        (insertType === 'heat-set' ? 'Threads into a heat-set insert in the base boss' : 'Self-taps into the base boss') +
        (screw.headStyle === 'counterbore' ? '; head sits in a counterbore in the lid' : ''),
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

  // External mounts imply hardware the case itself doesn't provide: a screw (and usually an anchor)
  // per hole, into whatever the case is being fixed to. Grouped by hole size, like the standoffs.
  const mountGroups = new Map<string, { quantity: number; diameter: number; hole: string }>();
  for (const feature of features) {
    if (feature.type !== 'external-mount' || !feature.mount || feature.mount.hole === 'none') continue;
    const { holeDiameter, hole } = feature.mount;
    const key = `${holeDiameter}/${hole}`;
    const existing = mountGroups.get(key);
    if (existing) existing.quantity += 1;
    else mountGroups.set(key, { quantity: 1, diameter: holeDiameter, hole });
  }
  for (const { quantity, diameter, hole } of mountGroups.values()) {
    rows.push({
      item: 'Mounting screw (case to wall/panel)',
      quantity,
      category: 'Hardware',
      notes: `Through a Ø${diameter}mm ${hole} in an external mount -- add wall anchors to suit the surface`,
    });
  }

  const header = ['Item', 'Quantity', 'Category', 'Notes'];
  const lines = [header, ...rows.map((r) => [r.item, String(r.quantity), r.category, r.notes])];
  return lines.map((cols) => cols.map(csvEscape).join(',')).join('\n');
}
