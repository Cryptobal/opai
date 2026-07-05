/**
 * Servicio de datos del buscador de cuentas/clientes/instalaciones en Slack
 * (Fase 1). Reusa `findCrmAccountIdsBySearch` (f_unaccent + RUT normalizado) y
 * agrega por cuenta lo que un comercial necesita ver de un vistazo: instalaciones
 * activas, negocios abiertos (nº + monto), última cotización, contacto principal
 * y estado de pago (DTEs impagos — lazy, "—" si falla; nunca rompe la ficha).
 *
 * Todo con `tenantId` en cada query (aislamiento multi-tenant) y null-safety
 * total: una cuenta con datos parciales renderiza igual.
 */

import { prisma } from "@/lib/prisma";
import { findCrmAccountIdsBySearch } from "@/lib/search-normalize";

export interface FoundAccount {
  id: string;
  name: string;
  rut: string | null;
  activeInstallations: number;
  openDealsCount: number;
  openDealsAmount: number;
  lastQuoteCode: string | null;
  lastQuoteStatus: string | null;
  contactName: string | null;
  contactPhone: string | null;
  /** null = el estado de pago no se pudo calcular (se muestra "—"). */
  unpaidCount: number | null;
  unpaidAmount: number;
}

/** Instalaciones activas por cuenta. */
async function activeInstallationsByAccount(tenantId: string, ids: string[]): Promise<Map<string, number>> {
  const rows = await prisma.crmInstallation.groupBy({
    by: ["accountId"],
    where: { tenantId, accountId: { in: ids }, status: "active" },
    _count: { _all: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) if (r.accountId) m.set(r.accountId, r._count._all);
  return m;
}

/** Negocios abiertos por cuenta: cantidad + suma de montos. */
async function openDealsByAccount(tenantId: string, ids: string[]): Promise<Map<string, { count: number; amount: number }>> {
  const rows = await prisma.crmDeal.groupBy({
    by: ["accountId"],
    where: { tenantId, accountId: { in: ids }, status: "open" },
    _count: { _all: true },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.accountId, { count: r._count._all, amount: Number(r._sum.amount ?? 0) }]));
}

/** Última cotización (code + estado) por cuenta. */
async function lastQuoteByAccount(tenantId: string, ids: string[]): Promise<Map<string, { code: string; status: string }>> {
  const rows = await prisma.cpqQuote.findMany({
    where: { tenantId, accountId: { in: ids } },
    orderBy: { createdAt: "desc" },
    select: { accountId: true, code: true, status: true },
  });
  const m = new Map<string, { code: string; status: string }>();
  for (const r of rows) {
    if (!r.accountId || m.has(r.accountId)) continue;
    m.set(r.accountId, { code: r.code, status: r.status ?? "draft" });
  }
  return m;
}

/** Contacto principal (nombre + teléfono) por cuenta. */
async function primaryContactByAccount(tenantId: string, ids: string[]): Promise<Map<string, { name: string | null; phone: string | null }>> {
  const rows = await prisma.crmContact.findMany({
    where: { tenantId, accountId: { in: ids } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { accountId: true, firstName: true, lastName: true, phone: true },
  });
  const m = new Map<string, { name: string | null; phone: string | null }>();
  for (const r of rows) {
    if (!r.accountId || m.has(r.accountId)) continue;
    const name = `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || null;
    m.set(r.accountId, { name, phone: r.phone ?? null });
  }
  return m;
}

/** DTEs emitidos impagos por cuenta (best-effort: null si la consulta falla). */
async function unpaidDtesByAccount(tenantId: string, ids: string[]): Promise<Map<string, { count: number; amount: number }> | null> {
  try {
    const rows = await prisma.financeDte.groupBy({
      by: ["crmAccountId"],
      where: {
        tenantId,
        crmAccountId: { in: ids },
        direction: "ISSUED",
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      _count: { _all: true },
      _sum: { amountPending: true },
    });
    const m = new Map<string, { count: number; amount: number }>();
    for (const r of rows) if (r.crmAccountId) m.set(r.crmAccountId, { count: r._count._all, amount: Number(r._sum.amountPending ?? 0) });
    return m;
  } catch (err) {
    console.error("[slack] accountSearch: estado de pago falló:", err);
    return null;
  }
}

/**
 * Busca cuentas por nombre/RUT/razón social e hidrata la ficha comercial.
 * Conserva el orden del SQL (created_at DESC). Máx `limit` resultados.
 */
export async function searchAccounts(tenantId: string, query: string, limit = 8): Promise<FoundAccount[]> {
  const ids = await findCrmAccountIdsBySearch({ tenantId, query, limit });
  if (!ids.length) return [];
  const accounts = await prisma.crmAccount.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, name: true, rut: true },
  });
  const [inst, deals, quotes, contacts, unpaid] = await Promise.all([
    activeInstallationsByAccount(tenantId, ids),
    openDealsByAccount(tenantId, ids),
    lastQuoteByAccount(tenantId, ids),
    primaryContactByAccount(tenantId, ids),
    unpaidDtesByAccount(tenantId, ids),
  ]);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const out: FoundAccount[] = [];
  for (const id of ids) {
    const a = byId.get(id);
    if (!a) continue;
    const d = deals.get(id) ?? { count: 0, amount: 0 };
    const q = quotes.get(id) ?? null;
    const c = contacts.get(id) ?? null;
    const u = unpaid ? unpaid.get(id) ?? { count: 0, amount: 0 } : null;
    out.push({
      id: a.id,
      name: (a.name || "Cliente").trim() || "Cliente",
      rut: a.rut ?? null,
      activeInstallations: inst.get(id) ?? 0,
      openDealsCount: d.count,
      openDealsAmount: d.amount,
      lastQuoteCode: q?.code ?? null,
      lastQuoteStatus: q?.status ?? null,
      contactName: c?.name ?? null,
      contactPhone: c?.phone ?? null,
      unpaidCount: u ? u.count : null,
      unpaidAmount: u ? u.amount : 0,
    });
  }
  return out;
}
