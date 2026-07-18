export function applyTextTruncatePieces(
  text: string | null | undefined,
  pieces: string[] | null | undefined,
): string | null {
  if (!text) return null;

  let result = text;
  for (const piece of pieces ?? []) {
    const trimmed = piece?.trim();
    if (!trimmed) continue;
    result = result.split(trimmed).join('');
  }

  const cleaned = result.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return cleaned || null;
}

export function normalizeTextTruncatePieces(
  pieces: string[] | null | undefined,
): string[] {
  if (!pieces?.length) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const piece of pieces) {
    const trimmed = typeof piece === 'string' ? piece.trim() : '';
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}
