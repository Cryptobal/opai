import type { CpqCoveragePattern } from "@/types/cpq";

/** Atributos de agrupación inyectados en cada DotacionItem / LeadPositionItem.
 *  Si serviceGroupKey === undefined → "Sin agrupar".
 *  serviceGroupKey es un UUID generado en cliente (crypto.randomUUID).
 */
export interface LeadServiceGroupRef {
  serviceGroupKey?: string;
  serviceGroupName?: string;
  serviceGroupPattern?: CpqCoveragePattern;
  serviceGroupOrder?: number;
  serviceGroupIcon?: string;
}

export function makeServiceGroupKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Agrupar items por serviceGroupKey, preservando orden e incluyendo "sin agrupar" al final. */
export function groupByService<T extends LeadServiceGroupRef>(items: T[]): {
  groups: Array<{
    key: string;
    name: string;
    pattern?: CpqCoveragePattern;
    icon?: string;
    order: number;
    items: T[];
  }>;
  ungrouped: T[];
} {
  const map = new Map<
    string,
    { key: string; name: string; pattern?: CpqCoveragePattern; icon?: string; order: number; items: T[] }
  >();
  const ungrouped: T[] = [];
  for (const it of items) {
    if (!it.serviceGroupKey) {
      ungrouped.push(it);
      continue;
    }
    const existing = map.get(it.serviceGroupKey);
    if (existing) {
      existing.items.push(it);
    } else {
      map.set(it.serviceGroupKey, {
        key: it.serviceGroupKey,
        name: it.serviceGroupName || "Servicio",
        pattern: it.serviceGroupPattern,
        icon: it.serviceGroupIcon,
        order: it.serviceGroupOrder ?? 0,
        items: [it],
      });
    }
  }
  const groups = Array.from(map.values()).sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name)
  );
  return { groups, ungrouped };
}
