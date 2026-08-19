export function toggleExpandAll(
  sectionIds: readonly string[],
  current: ReadonlySet<string>,
): Set<string> {
  const allOpen = sectionIds.length > 0 && sectionIds.every((id) => current.has(id));
  return allOpen ? new Set() : new Set(sectionIds);
}

export function toggleExpandedId(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function isAllExpanded(
  sectionIds: readonly string[],
  current: ReadonlySet<string>,
): boolean {
  return sectionIds.length > 0 && sectionIds.every((id) => current.has(id));
}
