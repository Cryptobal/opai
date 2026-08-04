import "server-only";
import { Prisma, type FlowSection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanRut } from "@/lib/chile-rut";
import {
  CANONICAL_FLOW_ROWS,
  FALLBACK_RENAMES,
  SECTION_MOVES,
} from "./canonical-rows";
import { normalizeRowName } from "./row-match";
import {
  normalizeNameForDedupe,
  pickAdoptionCandidate,
  pickDuplicateKeeper,
  shouldArchiveSurplusAccountRow,
  type AdoptionCandidate,
} from "./row-visibility";

type Tx = Prisma.TransactionClient;

/**
 * Reconciliación de filas de INGRESOS (v4.1, idempotente):
 *  1. Renombra fallbacks ("Otros clientes"→"Otros ingresos", etc.).
 *  2. Asegura canónicas (fallbacks + socios) sin duplicar.
 *  3. Adopta filas libres de la misma cuenta para templates activos sin fila
 *     (o crea si no hay candidata). Sin rama "missing accounts".
 *  4. Archiva sobrantes ACCOUNT_INSTALLATION sin template activo ni plan.
 *
 * Lock advisory por tenant. Dos ejecuciones seguidas = cero cambios.
 */
export async function reconcileIncomeRows(tenantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flow-v3-income-rows:${tenantId}`})::int8)`;
    await renameFallbacks(tx, tenantId);
    await applySectionMoves(tx, tenantId);
    await ensureCanonicalRows(tx, tenantId);
    await adoptOrCreateTemplateRows(tx, tenantId);
    await archiveSurplusRows(tx, tenantId);
  });
}

/** @deprecated Usar `reconcileIncomeRows`. Alias de compatibilidad. */
export const ensureIncomeRows = reconcileIncomeRows;

async function renameFallbacks(tx: Tx, tenantId: string): Promise<void> {
  for (const { from, to, section } of FALLBACK_RENAMES) {
    const fromKey = normalizeRowName(from);
    const rows = await tx.financeFlowRow.findMany({
      where: { tenantId, section, mapping: "MANUAL", archivedAt: null },
      select: { id: true, name: true },
    });
    for (const r of rows) {
      // Solo el canónico viejo (case-insensitive). Si el usuario lo
      // personalizó a otro texto, respetar.
      if (normalizeRowName(r.name) !== fromKey) continue;
      await tx.financeFlowRow.update({
        where: { id: r.id },
        data: { name: to },
      });
    }
  }
}

/** Mueve filas canónicas entre secciones (idempotente, sin duplicar). */
async function applySectionMoves(tx: Tx, tenantId: string): Promise<void> {
  for (const { name, fromSection, toSection } of SECTION_MOVES) {
    const nameKey = normalizeNameForDedupe(name);
    const rows = await tx.financeFlowRow.findMany({
      where: { tenantId, section: fromSection, archivedAt: null },
      select: { id: true, name: true },
    });
    for (const r of rows) {
      if (normalizeNameForDedupe(r.name) !== nameKey) continue;
      await tx.financeFlowRow.update({
        where: { id: r.id },
        data: { section: toSection as FlowSection },
      });
    }
  }
}

async function ensureCanonicalRows(tx: Tx, tenantId: string): Promise<void> {
  const [existing, categories, last] = await Promise.all([
    tx.financeFlowRow.findMany({
      where: { tenantId, archivedAt: null },
      select: { id: true, name: true, section: true },
    }),
    tx.financeCashflowCategory.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    }),
    tx.financeFlowRow.findFirst({
      where: { tenantId },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    }),
  ]);

  const bySectionName = new Set(
    existing.map((r) => `${r.section}::${normalizeNameForDedupe(r.name)}`),
  );
  // También aceptar nombres viejos de fallback como "ya existe".
  for (const { from, to, section } of FALLBACK_RENAMES) {
    if (bySectionName.has(`${section}::${normalizeNameForDedupe(from)}`)) {
      bySectionName.add(`${section}::${normalizeNameForDedupe(to)}`);
    }
  }

  const catByCode = new Map(categories.map((c) => [c.code, c.id]));
  let orderIndex = (last?.orderIndex ?? -1) + 1;

  for (const c of CANONICAL_FLOW_ROWS) {
    const key = `${c.section}::${normalizeNameForDedupe(c.name)}`;
    if (bySectionName.has(key)) continue;
    const categoryId = c.categoryCode ? (catByCode.get(c.categoryCode) ?? null) : null;
    await tx.financeFlowRow.create({
      data: {
        tenantId,
        section: c.section as FlowSection,
        name: c.name,
        mapping: categoryId ? "CATEGORY" : "MANUAL",
        orderIndex: orderIndex++,
        categoryId,
      },
    });
    bySectionName.add(key);
  }
}

async function adoptOrCreateTemplateRows(tx: Tx, tenantId: string): Promise<void> {
  const [rows, templates, accounts] = await Promise.all([
    tx.financeFlowRow.findMany({
      where: { tenantId, section: "INGRESOS", archivedAt: null },
      select: {
        id: true, name: true, crmAccountId: true, installationId: true,
        recurringTemplateId: true, createdAt: true,
      },
    }),
    tx.financeDteRecurringTemplate.findMany({
      where: { tenantId, isActive: true, dteType: { in: [33, 34] } },
      select: {
        id: true, name: true, crmAccountId: true, installationId: true,
        receiverRut: true,
      },
    }),
    tx.crmAccount.findMany({
      where: { tenantId },
      select: { id: true, name: true, rut: true },
    }),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const accountByRut = new Map<string, string>();
  for (const a of accounts) {
    if (!a.rut) continue;
    const key = cleanRut(a.rut);
    if (key && !accountByRut.has(key)) accountByRut.set(key, a.id);
  }
  const resolveAccount = (
    crmAccountId: string | null,
    receiverRut: string | null | undefined,
  ): string | null => {
    if (crmAccountId) return crmAccountId;
    if (!receiverRut) return null;
    const key = cleanRut(receiverRut);
    return key ? (accountByRut.get(key) ?? null) : null;
  };

  const linkedTemplates = new Set(
    rows.map((r) => r.recurringTemplateId).filter((x): x is string => !!x),
  );

  // Filas libres mutables (se van ocupando al adoptar).
  const free: AdoptionCandidate[] = rows
    .filter((r) => r.recurringTemplateId == null)
    .map((r) => ({
      id: r.id,
      crmAccountId: r.crmAccountId,
      installationId: r.installationId,
      recurringTemplateId: r.recurringTemplateId,
      name: r.name,
      createdAt: r.createdAt,
    }));

  const last = await tx.financeFlowRow.findFirst({
    where: { tenantId, section: "INGRESOS" },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  let orderIndex = (last?.orderIndex ?? -1) + 1;

  for (const t of templates) {
    if (linkedTemplates.has(t.id)) continue;
    const accId = resolveAccount(t.crmAccountId, t.receiverRut);
    if (!accId) continue;
    const acc = accountById.get(accId);
    if (!acc) continue;

    const candidate = pickAdoptionCandidate(
      {
        id: t.id,
        crmAccountId: accId,
        installationId: t.installationId,
        name: (t.name || acc.name).trim() || acc.name,
      },
      free,
    );

    if (candidate) {
      await tx.financeFlowRow.update({
        where: { id: candidate.id },
        data: {
          recurringTemplateId: t.id,
          // Conservar nombre del usuario; completar instalación si faltaba.
          installationId: candidate.installationId ?? t.installationId,
          crmAccountId: candidate.crmAccountId ?? accId,
        },
      });
      linkedTemplates.add(t.id);
      const idx = free.findIndex((r) => r.id === candidate.id);
      if (idx >= 0) free.splice(idx, 1);
      continue;
    }

    try {
      await tx.financeFlowRow.create({
        data: {
          tenantId,
          section: "INGRESOS",
          name: (t.name || acc.name).trim() || acc.name,
          mapping: "ACCOUNT_INSTALLATION",
          orderIndex: orderIndex++,
          crmAccountId: accId,
          installationId: t.installationId,
          recurringTemplateId: t.id,
        },
      });
      linkedTemplates.add(t.id);
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
}

async function archiveSurplusRows(tx: Tx, tenantId: string): Promise<void> {
  const [rows, activeTemplates, planRows] = await Promise.all([
    tx.financeFlowRow.findMany({
      where: {
        tenantId,
        section: "INGRESOS",
        mapping: "ACCOUNT_INSTALLATION",
        archivedAt: null,
      },
      select: {
        id: true, name: true, crmAccountId: true, installationId: true,
        recurringTemplateId: true, createdAt: true,
      },
    }),
    tx.financeDteRecurringTemplate.findMany({
      where: { tenantId, isActive: true },
      select: { id: true },
    }),
    tx.financeFlowPlanCell.findMany({
      where: { tenantId, amount: { not: 0 } },
      select: { rowId: true },
      distinct: ["rowId"],
    }),
  ]);

  const activeTplIds = new Set(activeTemplates.map((t) => t.id));
  const planRowIds = new Set(planRows.map((p) => p.rowId));

  // 1) Duplicados exactos por nombre NFD + misma cuenta.
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.crmAccountId) continue;
    const key = `${r.crmAccountId}::${normalizeNameForDedupe(r.name)}`;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }
  const archiveIds = new Set<string>();
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const enriched = group.map((r) => ({
      ...r,
      hasPlanData: planRowIds.has(r.id),
    }));
    const keeper = pickDuplicateKeeper(enriched);
    for (const r of enriched) {
      if (r.id === keeper.id) continue;
      archiveIds.add(r.id);
    }
  }

  // 2) Sobrantes sin template activo ni plan.
  for (const r of rows) {
    if (archiveIds.has(r.id)) continue;
    const linkedActive =
      !!r.recurringTemplateId && activeTplIds.has(r.recurringTemplateId);
    if (
      shouldArchiveSurplusAccountRow({
        hasPlanData: planRowIds.has(r.id),
        linkedActiveTemplate: linkedActive,
      })
    ) {
      archiveIds.add(r.id);
    }
  }

  if (archiveIds.size === 0) return;
  const now = new Date();
  await tx.financeFlowRow.updateMany({
    where: { tenantId, id: { in: [...archiveIds] } },
    data: { archivedAt: now },
  });
}
