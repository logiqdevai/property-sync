export function getDropdownOptionLabel<T extends string>(
  options: readonly { id: T | "all"; label: string }[],
  id: T | string,
): string {
  return options.find((option) => option.id === id)?.label ?? String(id);
}
