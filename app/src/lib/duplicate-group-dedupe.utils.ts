export function getDuplicateGroupDedupePlan(
  items: Array<{ id: string; duplicate_group_id: string | null }>,
  selectedIds: Set<string>,
): { keepIds: string[]; deleteIds: string[] } {
  const byGroup = new Map<string, string[]>();

  for (const item of items) {
    if (!selectedIds.has(item.id) || !item.duplicate_group_id) continue;
    const members = byGroup.get(item.duplicate_group_id) ?? [];
    members.push(item.id);
    byGroup.set(item.duplicate_group_id, members);
  }

  const keepIds: string[] = [];
  const deleteIds: string[] = [];

  for (const members of byGroup.values()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort();
    keepIds.push(sorted[0]);
    deleteIds.push(...sorted.slice(1));
  }

  return { keepIds, deleteIds };
}
