function normalizeTruncateText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('')
    .filter((c) => {
      const code = c.charCodeAt(0);
      return (code >= 32 && code !== 127) || code === 10 || code === 9;
    })
    .join('')
    .replace(/\t/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removePiece(
  text: string,
  piece: string,
  replacement: string,
): string {
  if (text.includes(piece)) {
    return text.split(piece).join(replacement);
  }

  const pattern = escapeRegExp(piece).replace(/\s+/g, '\\s+');
  return text.replace(new RegExp(pattern, 'g'), replacement);
}

export function applyTextTruncatePieces(
  text: string | null | undefined,
  pieces: string[] | null | undefined,
  replacement = '',
): string | null {
  if (!text) return null;

  let result = text;
  for (const piece of pieces ?? []) {
    const normalized = normalizeTruncateText(piece ?? '');
    if (!normalized) continue;
    result = removePiece(result, normalized, replacement);
  }

  const cleaned = normalizeTruncateText(result);
  return cleaned || null;
}

export function normalizeTextTruncatePieces(
  pieces: string[] | null | undefined,
): string[] {
  if (!pieces?.length) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const piece of pieces) {
    const cleaned =
      typeof piece === 'string' ? normalizeTruncateText(piece) : '';
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    normalized.push(cleaned);
  }

  return normalized;
}
