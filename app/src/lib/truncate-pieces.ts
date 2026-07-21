export type TruncatePieceMode = "text" | "pattern";

const PATTERN_PREFIX = "pattern:";

export function encodeTruncatePiece(mode: TruncatePieceMode, value: string): string {
  return mode === "pattern" ? `${PATTERN_PREFIX}${value}` : value;
}

export function parseTruncatePiece(piece: string): { mode: TruncatePieceMode; value: string } {
  if (piece.startsWith(PATTERN_PREFIX)) {
    return { mode: "pattern", value: piece.slice(PATTERN_PREFIX.length) };
  }
  return { mode: "text", value: piece };
}

export function buildPatternPreview(value: string): string {
  if (!value.trim()) return "";
  return value.replace(/\*/g, "[anything]").replace(/#/g, "[a number]");
}
