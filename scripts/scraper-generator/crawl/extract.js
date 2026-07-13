function normalizeFieldDef(def) {
  if (typeof def === 'string') return { selector: def, type: 'text' };
  return { selector: def.selector ?? def, type: def.type ?? 'text' };
}

export async function extractField(element, def) {
  const { selector, type } = normalizeFieldDef(def);
  const FIELD_TIMEOUT = 2000;
  try {
    const el = selector ? element.locator(selector).first() : element;
    if (type === 'href') return await el.getAttribute('href', { timeout: FIELD_TIMEOUT }) ?? null;
    if (type === 'src') return await el.getAttribute('src', { timeout: FIELD_TIMEOUT }) ?? null;
    if (type === 'background_image') {
      const style = await el.getAttribute('style', { timeout: FIELD_TIMEOUT }) ?? '';
      const m = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
      return m ? m[1] : null;
    }
    return (await el.textContent({ timeout: FIELD_TIMEOUT }))?.trim() || null;
  } catch {
    return null;
  }
}
