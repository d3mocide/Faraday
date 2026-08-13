import type { EnclosureProject } from '../types/project';

export interface PrintabilityStats {
  outerVolumeCm3: number;
  shellVolumeCm3: number;
  estimatedWeightGrams: number; // PLA density ~1.24 g/cm3, 25% infill
  estimatedPrintTimeHours: number;
  fastenersBom: { name: string; quantity: number }[];
  overhangWarnings: string[];
}

export function calculatePrintabilityStats(project: EnclosureProject): PrintabilityStats {
  const { body, features } = project;
  const wall = body.wallThickness;
  const lid = body.lid;

  let outerVolCm3 = 0;
  let innerVolCm3 = 0;

  if (body.shape === 'box' || body.shape === 'stadium' || body.shape === 'wedge') {
    const outerL = body.outer.length;
    const outerW = body.outer.width;
    const outerH = body.shape === 'wedge' ? body.outer.heightBack : body.outer.height;
    outerVolCm3 = (outerL * outerW * outerH) / 1000;
    const innerL = Math.max(0, outerL - wall * 2);
    const innerW = Math.max(0, outerW - wall * 2);
    const innerH = Math.max(0, outerH - wall * 2);
    innerVolCm3 = (innerL * innerW * innerH) / 1000;
  } else if (body.shape === 'hexagon' || body.shape === 'octagon') {
    const rOuter = body.outer.radius;
    const hOuter = body.outer.height;
    outerVolCm3 = (Math.PI * rOuter * rOuter * hOuter) / 1000;
    const rInner = Math.max(0, rOuter - wall);
    const hInner = Math.max(0, hOuter - wall * 2);
    innerVolCm3 = (Math.PI * rInner * rInner * hInner) / 1000;
  } else {
    const rOuter = body.outer.diameter / 2;
    const hOuter = body.outer.height;
    outerVolCm3 = (Math.PI * rOuter * rOuter * hOuter) / 1000;
    const rInner = Math.max(0, rOuter - wall);
    const hInner = Math.max(0, hOuter - wall * 2);
    innerVolCm3 = (Math.PI * rInner * rInner * hInner) / 1000;
  }

  const shellVolCm3 = Math.max(0, outerVolCm3 - innerVolCm3);

  // PLA density 1.24g/cm3 with 20% infill + 3 wall perimeters (~0.45 Effective density factor)
  const estimatedWeightGrams = Math.round(shellVolCm3 * 1.24 * 0.45);
  // Estimate ~35 cm3 per hour at standard print speed
  const estimatedPrintTimeHours = Number((shellVolCm3 / 35).toFixed(1));

  const fastenersBom: { name: string; quantity: number }[] = [];
  const overhangWarnings: string[] = [];

  if (lid.type === 'screw-boss' && lid.screw) {
    const count = lid.screw.count;
    const size = lid.screw.size;
    const insertType = lid.screw.insertType === 'heat-set' ? 'Heat-Set Insert' : 'Self-Tapping Screw';
    fastenersBom.push({ name: `${size} ${insertType}`, quantity: count });
    fastenersBom.push({ name: `${size} × 10mm M3 Screws`, quantity: count });
  }

  if (lid.gasket) {
    const perimeterMm =
      body.shape === 'box' || body.shape === 'stadium' || body.shape === 'wedge'
        ? (body.outer.length + body.outer.width) * 2
        : body.shape === 'hexagon' || body.shape === 'octagon'
        ? Math.PI * 2 * body.outer.radius
        : Math.PI * body.outer.diameter;
    fastenersBom.push({ name: `${lid.gasket.width}mm Silicone O-Ring Cord`, quantity: Math.ceil(perimeterMm) });
  }

  // Check for large horizontal overhang cutouts on side walls
  for (const feat of features) {
    if (feat.face === 'top' || feat.face === 'bottom') continue;
    if (feat.type === 'custom-hole' && feat.custom?.shape === 'rect' && (feat.custom.width > 25 || (feat.custom.height ?? 0) > 25)) {
      overhangWarnings.push(`Large rectangular cutout on ${feat.face} wall (${feat.custom.width}mm) may need bridging support.`);
    }
  }

  return {
    outerVolumeCm3: Number(outerVolCm3.toFixed(1)),
    shellVolumeCm3: Number(shellVolCm3.toFixed(1)),
    estimatedWeightGrams,
    estimatedPrintTimeHours: Math.max(0.5, estimatedPrintTimeHours),
    fastenersBom,
    overhangWarnings,
  };
}
