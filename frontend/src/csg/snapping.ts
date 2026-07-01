/** Snaps value to the nearest candidate within threshold, otherwise returns it unchanged. */
export function snapValue(value: number, candidates: number[], threshold: number): number {
  let best = value;
  let bestDist = threshold;
  for (const candidate of candidates) {
    const dist = Math.abs(value - candidate);
    if (dist <= bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}
