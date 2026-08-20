/**
 * Índices de match fila↔fuente compartidos por los tres derivadores.
 * Puros, sin prisma.
 *
 * Precedencia de egreso: supplierId → canonicalKey → accountPlanId → bandeja.
 */
import {
  UNMATCHED_EXPENSE_KEY,
  UNMATCHED_INCOME_KEY,
  type FlowRowRef,
} from "./types";

/** ¿Fila de ingresos por cuenta/instalación? (excluye MANUAL/CATEGORY/ACCOUNTS). */
function isAccountInstallationIncome(r: FlowRowRef): boolean {
  if (r.section != null && r.section !== "INGRESOS") return false;
  if (r.mapping != null && r.mapping !== "ACCOUNT_INSTALLATION") return false;
  return !!r.crmAccountId;
}

/**
 * Matcher de INGRESOS (prioridad):
 *  1. Fila de la programación (`recurringTemplateId`) — 1 fila = 1 template.
 *  2. Fila exacta cuenta+instalación (solo filas SIN template).
 *  3. Fila genérica de la cuenta (sin instalación, sin template).
 *  3.5 Fallback cuenta: exactamente una fila ACCOUNT_INSTALLATION activa
 *      (aunque sea de template); si hay varias, match por instalación entre
 *      filas de template; si sigue ambiguo → Otros ingresos.
 *  4. "Otros ingresos" (UNMATCHED_INCOME_KEY).
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
  const byAccount = new Map<string, FlowRowRef[]>();

  for (const r of rows) {
    if (r.recurringTemplateId) {
      if (!byTemplate.has(r.recurringTemplateId)) {
        byTemplate.set(r.recurringTemplateId, r.id);
      }
    } else if (isAccountInstallationIncome(r)) {
      if (r.installationId) exact.set(`${r.crmAccountId}::${r.installationId}`, r.id);
      else if (!generic.has(r.crmAccountId!)) generic.set(r.crmAccountId!, r.id);
    }

    if (isAccountInstallationIncome(r)) {
      const list = byAccount.get(r.crmAccountId!) ?? [];
      list.push(r);
      byAccount.set(r.crmAccountId!, list);
    }
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
    const gen = generic.get(accountId);
    if (gen) return gen;

    const candidates = byAccount.get(accountId) ?? [];
    if (candidates.length === 1) return candidates[0].id;
    if (candidates.length > 1 && installationId) {
      const byInst = candidates.filter(
        (r) => r.recurringTemplateId && r.installationId === installationId,
      );
      if (byInst.length === 1) return byInst[0].id;
    }
    return UNMATCHED_INCOME_KEY;
  };
}

export interface ExpenseIndexes {
  bySupplierId: Map<string, string>;
  byCanonicalKey: Map<string, string>;
  byAccountPlanId: Map<string, string>;
  byName: Map<string, string>;
}

export const normalizeRowName = (s: string) => s.trim().toLowerCase();

/**
 * Índices de EGRESOS.
 * `accountToRowId` viene de `bulkAccountToRow` (destino por defecto).
 * Si falta, se construye desde `row.accountPlanIds` (first-wins; útil en tests).
 */
export function buildExpenseIndexes(
  rows: FlowRowRef[],
  accountToRowId?: Map<string, string>,
): ExpenseIndexes {
  const bySupplierId = new Map<string, string>();
  const byCanonicalKey = new Map<string, string>();
  const byAccountPlanId = new Map<string, string>();
  const byName = new Map<string, string>();

  for (const r of rows) {
    if (r.canonicalKey && !byCanonicalKey.has(r.canonicalKey)) {
      byCanonicalKey.set(r.canonicalKey, r.id);
    }
    if (r.supplierId && !bySupplierId.has(r.supplierId)) {
      bySupplierId.set(r.supplierId, r.id);
    }
    const n = normalizeRowName(r.name);
    if (!byName.has(n)) byName.set(n, r.id);

    if (!accountToRowId && r.accountPlanIds) {
      for (const accId of r.accountPlanIds) {
        if (!byAccountPlanId.has(accId)) byAccountPlanId.set(accId, r.id);
      }
    }
  }

  if (accountToRowId) {
    for (const [accId, rowId] of accountToRowId) {
      byAccountPlanId.set(accId, rowId);
    }
  }

  return { bySupplierId, byCanonicalKey, byAccountPlanId, byName };
}

/**
 * Fila para un egreso. Precedencia:
 * supplierId → canonicalKey → accountPlanId → bandeja (UNMATCHED_EXPENSE_KEY).
 */
export function matchExpenseRow(
  idx: ExpenseIndexes,
  opts: {
    supplierId?: string | null;
    canonicalKey?: string | null;
    /** Probar varias llaves en orden (hijo operativo → padre). */
    canonicalKeys?: Array<string | null | undefined>;
    accountPlanId?: string | null;
  },
): string {
  if (opts.supplierId) {
    const hit = idx.bySupplierId.get(opts.supplierId);
    if (hit) return hit;
  }
  const keys = opts.canonicalKeys?.length
    ? opts.canonicalKeys
    : opts.canonicalKey
      ? [opts.canonicalKey]
      : [];
  for (const key of keys) {
    if (!key) continue;
    const hit = idx.byCanonicalKey.get(key);
    if (hit) return hit;
  }
  if (opts.accountPlanId) {
    const hit = idx.byAccountPlanId.get(opts.accountPlanId);
    if (hit) return hit;
  }
  return UNMATCHED_EXPENSE_KEY;
}
