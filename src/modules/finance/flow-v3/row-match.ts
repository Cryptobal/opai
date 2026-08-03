/**
 * Índices de match fila↔fuente compartidos por los tres derivadores.
 * Puros, sin prisma.
 */
import {
  UNMATCHED_EXPENSE_KEY,
  UNMATCHED_INCOME_KEY,
  type FlowRowRef,
} from "./types";

/**
 * Matcher de INGRESOS (prioridad):
 *  1. Fila de la programación (`recurringTemplateId`) — 1 fila = 1 template.
 *  2. Fila exacta cuenta+instalación (solo filas SIN template).
 *  3. Fila genérica de la cuenta (sin instalación, sin template).
 *  4. "Otros clientes" (UNMATCHED_INCOME_KEY).
 *
 * Las filas ligadas a template NO saturan exact/generic: así Transmat 20% y
 * Transmat 80% conviven y las facturas one-shot siguen yendo a la fila de cuenta.
 */
export function buildIncomeMatcher(
  rows: FlowRowRef[],
): (
  accountId: string | null,
  installationId: string | null,
  templateId?: string | null,
) => string {
  const byTemplate = new Map<string, string>();
  const exact = new Map<string, string>();
  const generic = new Map<string, string>();
  for (const r of rows) {
    if (r.recurringTemplateId) {
      if (!byTemplate.has(r.recurringTemplateId)) {
        byTemplate.set(r.recurringTemplateId, r.id);
      }
      continue;
    }
    if (!r.crmAccountId) continue;
    if (r.installationId) exact.set(`${r.crmAccountId}::${r.installationId}`, r.id);
    else if (!generic.has(r.crmAccountId)) generic.set(r.crmAccountId, r.id);
  }
  return (accountId, installationId, templateId) => {
    if (templateId) {
      const hit = byTemplate.get(templateId);
      if (hit) return hit;
    }
    if (!accountId) return UNMATCHED_INCOME_KEY;
    if (installationId) {
      const hit = exact.get(`${accountId}::${installationId}`);
      if (hit) return hit;
    }
    return generic.get(accountId) ?? UNMATCHED_INCOME_KEY;
  };
}

export interface ExpenseIndexes {
  byCategoryId: Map<string, string>;
  byCategoryCode: Map<string, string>;
  bySupplierId: Map<string, string>;
  byName: Map<string, string>;
}

export const normalizeRowName = (s: string) => s.trim().toLowerCase();

/** Índices de EGRESOS: categoría (id y código canónico), proveedor y nombre. */
export function buildExpenseIndexes(
  rows: FlowRowRef[],
  categoryCodeById: Map<string, string>,
): ExpenseIndexes {
  const byCategoryId = new Map<string, string>();
  const byCategoryCode = new Map<string, string>();
  const bySupplierId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const r of rows) {
    if (r.categoryId) {
      if (!byCategoryId.has(r.categoryId)) byCategoryId.set(r.categoryId, r.id);
      const code = categoryCodeById.get(r.categoryId);
      if (code && !byCategoryCode.has(code)) byCategoryCode.set(code, r.id);
    }
    if (r.supplierId && !bySupplierId.has(r.supplierId)) bySupplierId.set(r.supplierId, r.id);
    const n = normalizeRowName(r.name);
    if (!byName.has(n)) byName.set(n, r.id);
  }
  return { byCategoryId, byCategoryCode, bySupplierId, byName };
}

/** Fila para un egreso por categoría/proveedor, con fallback "Otros gastos". */
export function matchExpenseRow(
  idx: ExpenseIndexes,
  opts: { supplierId?: string | null; categoryId?: string | null; categoryCode?: string | null },
): string {
  if (opts.supplierId) {
    const hit = idx.bySupplierId.get(opts.supplierId);
    if (hit) return hit;
  }
  if (opts.categoryId) {
    const hit = idx.byCategoryId.get(opts.categoryId);
    if (hit) return hit;
  }
  if (opts.categoryCode) {
    const hit = idx.byCategoryCode.get(opts.categoryCode);
    if (hit) return hit;
  }
  return UNMATCHED_EXPENSE_KEY;
}
