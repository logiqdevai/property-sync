export const sourceAgencySummarySelect = {
  id: true,
  name: true,
} as const;

export type SourceAgencySummary = {
  id: string;
  name: string;
};

export function resolveSourceAgency(
  sourceLinks: Array<{
    is_primary_source: boolean;
    source_property: { source_agency: SourceAgencySummary | null };
  }>,
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
