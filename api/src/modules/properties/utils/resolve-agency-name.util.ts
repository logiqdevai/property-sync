export const sourceAgencySummarySelect = {
  id: true,
  name: true,
} as const;

export type SourceAgencySummary = {
  id: string;
  name: string;
};

type SourceLinkWithAgency = {
  is_primary_source: boolean;
  source_property: { source_agency: SourceAgencySummary | null };
};

export function resolveSourceAgency(
  sourceLinks: SourceLinkWithAgency[],
): SourceAgencySummary | null {
  let fallback: SourceAgencySummary | null = null;

  for (const link of sourceLinks) {
    const agency = link.source_property.source_agency;
    if (!agency) continue;
    if (link.is_primary_source) return agency;
    if (!fallback) fallback = agency;
  }

  return fallback;
}

export function resolveSourceUrl(
  sourceLinks: Array<{
    is_primary_source: boolean;
    source_property: { source_url: string };
  }>,
): string | null {
  let fallback: string | null = null;

  for (const link of sourceLinks) {
    const sourceUrl = link.source_property.source_url;
    if (!sourceUrl) continue;
    if (link.is_primary_source) return sourceUrl;
    if (!fallback) fallback = sourceUrl;
  }

  return fallback;
}
