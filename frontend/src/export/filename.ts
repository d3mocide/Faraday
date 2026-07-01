export function sanitizeFilename(name: string): string {
  const trimmed = name.trim().replace(/[^a-z0-9-_]+/gi, '-');
  return trimmed.length > 0 ? trimmed : 'faraday-enclosure';
}
