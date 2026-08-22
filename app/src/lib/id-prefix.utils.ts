export function getIdPrefixBeforeDash(id: string): string {
  const dashIndex = id.indexOf("-");
  if (dashIndex === -1) return id;
  return id.slice(0, dashIndex);
}
