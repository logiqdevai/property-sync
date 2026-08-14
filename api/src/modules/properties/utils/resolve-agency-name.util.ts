export type AgencyNameSourceLink = {
  is_primary_source: boolean;
  source_property: { source_agency: { name: string } | null };
};

export function resolveAgencyName(
  sourceLinks: AgencyNameSourceLink[],
): string | null {
  const names: string[] = [];
  const seen = new Set<string>();
  const ordered = [...sourceLinks].toSorted(
    (a, b) => Number(b.is_primary_source) - Number(a.is_primary_source),
  );

  for (const link of ordered) {
    const name = link.source_property.source_agency?.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return names.length > 0 ? names.join(', ') : null;
}
