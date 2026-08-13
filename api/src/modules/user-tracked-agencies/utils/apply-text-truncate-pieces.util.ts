const PATTERN_PREFIX = 'pattern:';
const WILDCARD_MARKER = '@@TRUNCATE_WILDCARD@@';
const NUMBER_MARKER = '@@TRUNCATE_NUMBER@@';

export type TruncatePieceMode = 'text' | 'pattern';

export function encodeTruncatePiece(mode: TruncatePieceMode, value: string): string {
  return mode === 'pattern' ? `${PATTERN_PREFIX}${value}` : value;
}

function parsePiece(piece: string): { mode: TruncatePieceMode; value: string } {
  if (piece.startsWith(PATTERN_PREFIX)) {
    return { mode: 'pattern', value: piece.slice(PATTERN_PREFIX.length) };
  }
  return { mode: 'text', value: piece };
}

export function normalizeTruncateText(text: string): string {
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

function buildPatternRegExp(pattern: string): RegExp {
  const withMarkers = pattern
    .replace(/\*/g, WILDCARD_MARKER)
    .replace(/#/g, NUMBER_MARKER);
  const source = escapeRegExp(withMarkers)
    .replace(/\s+/g, '\\s+')
    .split(WILDCARD_MARKER)
    .join('[\\s\\S]*?')
    .split(NUMBER_MARKER)
    .join('[0-9]+(?:-[0-9]+)*');
  return new RegExp(source, 'gu');
}

function removePiece(
  text: string,
  piece: string,
  replacement: string,
): string {
  const { mode, value } = parsePiece(piece);

  if (mode === 'pattern') {
    return text.replace(buildPatternRegExp(value), replacement);
  }

  if (text.includes(value)) {
    return text.split(value).join(replacement);
  }

  const pattern = escapeRegExp(value).replace(/\s+/g, '\\s+');
  return text.replace(new RegExp(pattern, 'gu'), replacement);
}

export function applyTextTruncatePieces(
  text: string | null | undefined,
  pieces: string[] | null | undefined,
  replacement = '',
): string | null {
  if (!text) return null;

  let result = normalizeTruncateText(text);
  for (const piece of pieces ?? []) {
    if (typeof piece !== 'string' || !piece) continue;
    const { mode, value } = parsePiece(piece);
    const normalizedValue = normalizeTruncateText(value);
    if (!normalizedValue) continue;
    result = removePiece(
      result,
      encodeTruncatePiece(mode, normalizedValue),
      replacement,
    );
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
    if (typeof piece !== 'string') continue;
    const { mode, value } = parsePiece(piece);
    const cleaned = normalizeTruncateText(value);
    if (!cleaned) continue;
    const stored = encodeTruncatePiece(mode, cleaned);
    if (seen.has(stored)) continue;
    seen.add(stored);
    normalized.push(stored);
  }

  return normalized;
}

export function didTextTruncateChange(
  text: string | null | undefined,
  pieces: string[],
  replacement = '',
): boolean {
  const previous = text ? normalizeTruncateText(text) : '';
  const next = applyTextTruncatePieces(text, pieces, replacement) ?? '';
  return next !== previous;
}

export function buildLocalizedTruncateUpdates(
  rows: Array<{ id: string; user_property_id: string; text: string }>,
  pieces: string[],
  replacement = '',
): Array<{ id: string; user_property_id: string; text: string }> {
  return rows.flatMap((row) => {
    if (!didTextTruncateChange(row.text, pieces, replacement)) return [];
    const nextText = applyTextTruncatePieces(row.text, pieces, replacement) ?? '';
    return [
      {
        id: row.id,
        user_property_id: row.user_property_id,
        text: nextText,
      },
    ];
  });
}
