export function extractCsrfToken(html: string): string | null {
  const match = html.match(
    /<input[^>]*name=["']__csrf["'][^>]*value=["']([^"']+)["']/i,
  );
  if (match?.[1]) {
    return match[1];
  }

  const reverseMatch = html.match(
    /<input[^>]*value=["']([^"']+)["'][^>]*name=["']__csrf["']/i,
  );
  return reverseMatch?.[1] ?? null;
}

export function extractAppToken(html: string): string | null {
  const match = html.match(/var\s+token\s*=\s*'([^']+)'/);
  return match?.[1] ?? null;
}
