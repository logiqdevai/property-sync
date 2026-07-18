const DUPLICATE_GROUP_CHIP_CLASSES = [
  "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200",
  "bg-teal-100 text-teal-900 dark:bg-teal-950/80 dark:text-teal-200",
  "bg-rose-100 text-rose-900 dark:bg-rose-950/80 dark:text-rose-200",
  "bg-sky-100 text-sky-900 dark:bg-sky-950/80 dark:text-sky-200",
  "bg-lime-100 text-lime-900 dark:bg-lime-950/80 dark:text-lime-200",
  "bg-orange-100 text-orange-900 dark:bg-orange-950/80 dark:text-orange-200",
  "bg-cyan-100 text-cyan-900 dark:bg-cyan-950/80 dark:text-cyan-200",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200",
  "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/80 dark:text-indigo-200",
  "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950/80 dark:text-fuchsia-200",
] as const;

const DUPLICATE_GROUP_ROW_CLASSES = [
  "bg-amber-100 dark:bg-amber-950/55",
  "bg-teal-100 dark:bg-teal-950/55",
  "bg-rose-100 dark:bg-rose-950/55",
  "bg-sky-100 dark:bg-sky-950/55",
  "bg-lime-100 dark:bg-lime-950/55",
  "bg-orange-100 dark:bg-orange-950/55",
  "bg-cyan-100 dark:bg-cyan-950/55",
  "bg-emerald-100 dark:bg-emerald-950/55",
  "bg-indigo-100 dark:bg-indigo-950/55",
  "bg-fuchsia-100 dark:bg-fuchsia-950/55",
] as const;

function hashGroupId(groupId: string): number {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = (hash * 31 + groupId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getDuplicateGroupColorIndex(groupId: string): number {
  return hashGroupId(groupId) % DUPLICATE_GROUP_CHIP_CLASSES.length;
}

export function getDuplicateGroupChipClasses(groupId: string): string {
  return DUPLICATE_GROUP_CHIP_CLASSES[getDuplicateGroupColorIndex(groupId)];
}

export function getDuplicateGroupRowClasses(groupId: string): string {
  return DUPLICATE_GROUP_ROW_CLASSES[getDuplicateGroupColorIndex(groupId)];
}

export function getDuplicateGroupShortLabel(groupId: string): string {
  return groupId.replace(/-/g, "").slice(0, 4).toUpperCase();
}
