/**
 * Resuelve ítems de catálogo CPQ vivos para líneas de cotización.
 *
 * Si un ítem se desactiva y se recrea con el mismo nombre (p. ej. al editar
 * exámenes en configuración), las cotizaciones siguen apuntando al ID viejo
 * y desaparecen del CPQ. Esta helper reengancha al ítem activo equivalente
 * y prefiere la fila viva del catálogo (precios/textos actuales).
 */

export type CatalogItemRef = {
  id: string;
  type: string;
  name: string;
  tenantId?: string | null;
  active?: boolean;
  defaultTechnicalSpecs?: string | null;
};

export type QuoteCatalogLine = {
  catalogItemId?: string | null;
  catalogItem?: CatalogItemRef | null;
  technicalSpecs?: string | null;
  unitPriceOverride?: unknown;
  active?: boolean;
};

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function resolveActiveCatalogItem<T extends CatalogItemRef>(
  referenced: CatalogItemRef | null | undefined,
  activeCatalog: T[],
  tenantId?: string | null,
): T | undefined {
  if (!referenced) return undefined;

  const liveById = activeCatalog.find((item) => item.id === referenced.id);
  if (liveById) return liveById;

  const target = norm(referenced.name);
  if (!target) return undefined;

  const matches = activeCatalog.filter(
    (item) => item.type === referenced.type && norm(item.name) === target,
  );
  if (matches.length === 0) return undefined;

  const tenantMatch = tenantId
    ? matches.find((item) => item.tenantId === tenantId)
    : undefined;
  return tenantMatch ?? matches.find((item) => item.tenantId == null) ?? matches[0];
}

export function hydrateQuoteCatalogLine<T extends QuoteCatalogLine, C extends CatalogItemRef>(
  line: T,
  activeCatalog: C[],
  tenantId?: string | null,
): T {
  if (!line.catalogItemId) return line;

  const referenced =
    line.catalogItem ??
    activeCatalog.find((item) => item.id === line.catalogItemId) ??
    null;
  const resolved = resolveActiveCatalogItem(referenced, activeCatalog, tenantId);
  if (!resolved) return line;

  const remapped = resolved.id !== line.catalogItemId;
  const specsWereOldDefault =
    remapped &&
    line.technicalSpecs != null &&
    referenced != null &&
    line.technicalSpecs === referenced.defaultTechnicalSpecs;

  return {
    ...line,
    catalogItemId: resolved.id,
    catalogItem: resolved,
    technicalSpecs: specsWereOldDefault ? null : line.technicalSpecs,
  };
}

export function hydrateQuoteCatalogLines<T extends QuoteCatalogLine, C extends CatalogItemRef>(
  lines: T[],
  activeCatalog: C[],
  tenantId?: string | null,
): T[] {
  const hydrated = lines.map((line) =>
    hydrateQuoteCatalogLine(line, activeCatalog, tenantId),
  );
  return dedupeQuoteCatalogLines(hydrated);
}

export function dedupeQuoteCatalogLines<T extends QuoteCatalogLine>(lines: T[]): T[] {
  const map = new Map<string, T>();
  const withoutCatalog: T[] = [];
  for (const line of lines) {
    if (!line.catalogItemId) {
      withoutCatalog.push(line);
      continue;
    }
    const existing = map.get(line.catalogItemId);
    if (!existing) {
      map.set(line.catalogItemId, line);
      continue;
    }
    const existingActive = existing.active !== false;
    const lineActive = line.active !== false;
    if (lineActive && !existingActive) {
      map.set(line.catalogItemId, line);
    }
  }
  return [...Array.from(map.values()), ...withoutCatalog];
}
