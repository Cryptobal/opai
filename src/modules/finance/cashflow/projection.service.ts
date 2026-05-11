import "server-only";
import { prisma } from "@/lib/prisma";
import { listItems } from "./item.service";
import { listMaterializedOccurrences } from "./occurrence.service";
import { listCategories } from "./category.service";
import { getOrCreateCashflowConfig } from "./config.service";
import { expandRecurrence, bucketKeyFor, bucketBoundsFor } from "./recurrence-engine";
import { resolveUfForOccurrence } from "./uf-resolver";
import type {
  ProjectionMatrix,
  ProjectionRange,
  ProjectionBucket,
  VirtualOccurrence,
  ProjectionRow,
  FinanceCashflowCategory,
} from "./types";
import { eachDayOfInterval } from "date-fns";

import { matchOccurrencesToBankLinks, type BankLinkSlim } from "./account-matcher";
import { resolveCategoryForLink } from "./category-resolver";
import { bulkResolveCategoriesFromAccounts } from "./categoryAccount.service";

type CategoryLite = Pick<FinanceCashflowCategory, "id" | "code" | "name" | "kind" | "sortOrder">;

/**
 * Tolerancia (en días) para asociar una `FinanceCashflowOccurrence` ya
 * materializada con su cuota virtual del mismo período. Cuando el usuario
 * mueve una cuota MONTHLY del día 15 al día 22, la materialized cae fuera
 * del set de fechas virtuales (que sigue siendo el día 15). Sin esta
 * tolerancia, el proyector "olvida" la materialized en la nueva fecha y
 * vuelve a renderizar la virtual en la fecha original — visualmente, la
 * cuota "no se mueve".
 */
function recurrenceMatchToleranceDays(rec: string): number {
  switch (rec) {
    case "WEEKLY":
      return 3;
    case "BIWEEKLY":
      return 7;
    case "MONTHLY":
      return 15;
    case "QUARTERLY":
      return 45;
    case "YEARLY":
      return 180;
    case "ONCE":
    default:
      return 0;
  }
}

async function loadResolvedBankLinks(
  tenantId: string,
  range: ProjectionRange,
  categoryByCode: Map<string, CategoryLite>,
): Promise<BankLinkSlim[]> {
  const links = await prisma.financeBankTransactionLink.findMany({
    where: {
      tenantId,
      bankTransaction: {
        transactionDate: { gte: range.from, lte: range.to },
        hiddenAt: null,
      },
    },
    select: {
      id: true,
      bankTransactionId: true,
      targetType: true,
      targetId: true,
      amount: true,
      accountPlanId: true,
      bankTransaction: { select: { transactionDate: true } },
    },
  });

  // Recolectar todos los account ids relevantes (links directos + DTE lines)
  const directAccountIds = new Set<string>();
  for (const l of links) if (l.accountPlanId) directAccountIds.add(l.accountPlanId);

  const dteIds = links
    .filter(
      (l) =>
        (l.targetType === "DTE_ISSUED" || l.targetType === "DTE_RECEIVED") && l.targetId,
    )
    .map((l) => l.targetId!) as string[];

  const dteLines =
    dteIds.length > 0
      ? await prisma.financeDteLine.findMany({
          where: { dteId: { in: dteIds } },
          select: { dteId: true, accountId: true },
        })
      : [];
  for (const dl of dteLines) if (dl.accountId) directAccountIds.add(dl.accountId);

  const accountToCategory = await bulkResolveCategoriesFromAccounts(
    tenantId,
    Array.from(directAccountIds),
  );

  // Atajos para payroll / TE — resolver una vez por request
  const sueldoCat = categoryByCode.get("EGR_SUELDO");
  const turnoExtraCat = categoryByCode.get("EGR_TURNO_EXTRA");
  const anticipoCat = categoryByCode.get("EGR_QUINCENA");

  const resolved: BankLinkSlim[] = [];
  for (const l of links) {
    const dteAccountIds =
      (l.targetType === "DTE_ISSUED" || l.targetType === "DTE_RECEIVED") && l.targetId
        ? dteLines
            .filter((dl) => dl.dteId === l.targetId && dl.accountId)
            .map((dl) => dl.accountId!)
        : [];
    const cat = resolveCategoryForLink({
      targetType: l.targetType,
      accountPlanId: l.accountPlanId,
      dteAccountIds,
      accountToCategory,
      payrollSueldoCategoryId: sueldoCat?.id ?? null,
      payrollTurnoExtraCategoryId: turnoExtraCat?.id ?? null,
      payrollAnticipoCategoryId: anticipoCat?.id ?? null,
    });
    if (!cat) continue;
    resolved.push({
      bankTransactionId: l.bankTransactionId,
      transactionDate: l.bankTransaction.transactionDate,
      amountClp: Math.abs(Number(l.amount)),
      categoryId: cat.id,
    });
  }
  return resolved;
}

export async function buildProjection(
  tenantId: string,
  range: ProjectionRange,
): Promise<ProjectionMatrix> {
  const config = await getOrCreateCashflowConfig(tenantId);
  const categories = await listCategories(tenantId);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const codeToCategory = new Map<string, CategoryLite>(
    categories.map((c) => [c.code, c]),
  );

  const items = await listItems(tenantId, { isActive: true });
  // FinanceCashflowItem.installationId no tiene @relation, así que resolvemos
  // los nombres en un lookup batch por tenant. Pick mínimo para no traer overhead.
  const installationIds = Array.from(
    new Set(items.map((i) => i.installationId).filter((x): x is string => !!x)),
  );
  const installations =
    installationIds.length > 0
      ? await prisma.crmInstallation.findMany({
          where: { tenantId, id: { in: installationIds } },
          select: { id: true, name: true },
        })
      : [];
  const installationNameById = new Map(installations.map((i) => [i.id, i.name]));
  const materialized = await listMaterializedOccurrences(
    tenantId,
    range.from,
    range.to,
    items.map((i) => i.id),
  );
  // Agrupar materialized por itemId para hacer matching por período.
  const matsByItem = new Map<string, typeof materialized>();
  for (const m of materialized) {
    const arr = matsByItem.get(m.itemId) ?? [];
    arr.push(m);
    matsByItem.set(m.itemId, arr);
  }

  const allOccurrences: VirtualOccurrence[] = [];

  for (const item of items) {
    const virtualDates = expandRecurrence(item, range.from, range.to);
    const itemMats = matsByItem.get(item.id) ?? [];
    const tolerance = recurrenceMatchToleranceDays(item.recurrence);

    // Cada slot representa una cuota a renderizar: combina una fecha
    // efectiva (la de la materialized si existe, si no la virtual) con la
    // materialized asociada (override de monto, status, etc).
    type Slot = { d: Date; mat: typeof materialized[number] | null };
    const slots: Slot[] = virtualDates.map((d) => ({ d, mat: null }));
    const claimedSlotIdx = new Set<number>();
    const claimedMatIds = new Set<string>();

    // Pasada 1 — match exacto por fecha (fast path para cuotas no movidas).
    for (const m of itemMats) {
      const key = m.scheduledDate.toISOString().slice(0, 10);
      const idx = slots.findIndex(
        (s, i) =>
          !claimedSlotIdx.has(i) && s.d.toISOString().slice(0, 10) === key,
      );
      if (idx !== -1) {
        slots[idx] = { d: m.scheduledDate, mat: m };
        claimedSlotIdx.add(idx);
        claimedMatIds.add(m.id);
      }
    }

    // Pasada 2 — match tolerante: la materialized está dentro de la
    // ventana de tolerancia de una virtual no reclamada. Esto cubre el
    // caso típico "moví la cuota del 15 al 22 del mismo mes".
    for (const m of itemMats) {
      if (claimedMatIds.has(m.id)) continue;
      let bestIdx = -1;
      let bestDelta = Infinity;
      for (let i = 0; i < slots.length; i++) {
        if (claimedSlotIdx.has(i)) continue;
        const deltaDays =
          Math.abs(slots[i].d.getTime() - m.scheduledDate.getTime()) /
          86_400_000;
        if (deltaDays <= tolerance && deltaDays < bestDelta) {
          bestDelta = deltaDays;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1) {
        slots[bestIdx] = { d: m.scheduledDate, mat: m };
        claimedSlotIdx.add(bestIdx);
        claimedMatIds.add(m.id);
      } else {
        // Materialized fuera de cualquier ventana virtual (caso raro:
        // cuota movida muy lejos de su período original). La incluimos
        // igual como slot extra para no perderla.
        slots.push({ d: m.scheduledDate, mat: m });
        claimedMatIds.add(m.id);
      }
    }

    for (const { d, mat } of slots) {
      let amountClp: number;
      let ufValue: number | null = null;
      const itemAmount = Number(item.amount);
      if (item.currency === "UF") {
        ufValue = mat?.ufValueUsed
          ? Number(mat.ufValueUsed)
          : await resolveUfForOccurrence(item.ufFixingPolicy, item.ufFixingDay, d);
        const baseUf = mat?.amountOverride !== null && mat?.amountOverride !== undefined
          ? Number(mat.amountOverride)
          : itemAmount;
        amountClp = mat?.amountClp !== undefined && mat?.amountClp !== null
          ? Number(mat.amountClp)
          : baseUf * ufValue;
      } else {
        amountClp = mat?.amountClp !== undefined && mat?.amountClp !== null
          ? Number(mat.amountClp)
          : (mat?.amountOverride !== null && mat?.amountOverride !== undefined
            ? Number(mat.amountOverride)
            : itemAmount);
      }
      const cat = categoryMap.get(item.categoryId);
      allOccurrences.push({
        id: mat?.id ?? null,
        itemId: item.id,
        source: item.source,
        categoryId: item.categoryId,
        categoryCode: cat?.code ?? "UNKNOWN",
        categoryName: cat?.name ?? "Sin categoría",
        kind: item.kind,
        name: item.name,
        description: item.description,
        scheduledDate: d,
        effectiveDate: mat?.effectiveDate ?? null,
        amountClp,
        amountOriginal: mat?.amountOverride !== null && mat?.amountOverride !== undefined
          ? Number(mat.amountOverride)
          : itemAmount,
        currency: item.currency,
        ufValueUsed: ufValue,
        status: mat?.status ?? "PROJECTED",
        installationId: item.installationId,
        installationName: item.installationId
          ? (installationNameById.get(item.installationId) ?? null)
          : null,
        crmAccountId: item.crmAccountId ?? null,
        bankTransactionId: mat?.bankTransactionId ?? null,
        isVirtual: !mat,
        isAutoGenerated: false,
        actualAmountClp: null,
        varianceClp: null,
      });
    }
  }

  // Todos los generadores automáticos (CONTRACT, PAYROLL, TURNOS_EXTRA, IVA,
  // RECURRING_DTE) ahora se materializan como FinanceCashflowItem y se expanden
  // con expandRecurrence (loop arriba). Los flags config.autoX gobiernan la
  // activación/desactivación masiva (ver setXItemsActive en cada generator).
  // No se emiten ocurrencias virtuales paralelas; eso permitía drag/edit/match
  // sobre filas que la UI consideraba "huérfanas".

  // Inicializar campos de varianza en todas las ocurrencias
  for (const occ of allOccurrences) {
    occ.actualAmountClp = null;
    occ.varianceClp = null;
  }

  // Aplicar matcher account-driven con bank links ya conciliados
  const bankLinks = await loadResolvedBankLinks(tenantId, range, codeToCategory);
  const matched = await matchOccurrencesToBankLinks(allOccurrences, bankLinks, {
    matchDaysTolerance: config.matchDaysTolerance,
  });

  // Mergear actualizaciones de matched de vuelta en allOccurrences
  const matchedByItemDate = new Map<string, VirtualOccurrence>();
  for (const m of matched) {
    if (m.itemId) {
      matchedByItemDate.set(`${m.itemId}|${m.scheduledDate.toISOString().slice(0, 10)}`, m);
    }
  }
  for (let i = 0; i < allOccurrences.length; i++) {
    const occ = allOccurrences[i];
    if (!occ.itemId) continue;
    const key = `${occ.itemId}|${occ.scheduledDate.toISOString().slice(0, 10)}`;
    const m = matchedByItemDate.get(key);
    if (m) allOccurrences[i] = m;
  }

  const buckets = buildBuckets(range);
  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));

  for (const occ of allOccurrences) {
    const key = bucketKeyFor(occ.scheduledDate, range.granularity);
    const idx = bucketIndex.get(key);
    if (idx === undefined) continue;
    const b = buckets[idx];
    if (occ.kind === "INCOME") {
      b.income += occ.amountClp;
      if (occ.actualAmountClp !== null) b.actualIncome += occ.actualAmountClp;
    } else {
      b.expense += occ.amountClp;
      if (occ.actualAmountClp !== null) b.actualExpense += occ.actualAmountClp;
    }
    b.net = b.income - b.expense;
    // varianza neta del bucket: (real ingresos − proyectados) − (real egresos − proyectados)
    b.varianceClp = (b.actualIncome - b.income) - (b.actualExpense - b.expense);
    b.occurrences.push(occ);
  }

  // Cargar TODOS los movimientos bancarios visibles del rango para mostrar
  // cuadratura banco vs proyectado (independiente de conciliación).
  const bankTxs = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      transactionDate: { gte: range.from, lte: range.to },
      hiddenAt: null,
    },
    select: { transactionDate: true, amount: true },
  });
  for (const tx of bankTxs) {
    const key = bucketKeyFor(tx.transactionDate, range.granularity);
    const idx = bucketIndex.get(key);
    if (idx === undefined) continue;
    const b = buckets[idx];
    const amt = Number(tx.amount);
    if (amt > 0) {
      b.actualBankIncome += amt;
    } else {
      b.actualBankExpense += Math.abs(amt);
    }
  }
  for (const b of buckets) {
    b.actualBankNet = b.actualBankIncome - b.actualBankExpense;
    b.bankVarianceClp =
      (b.actualBankIncome - b.income) - (b.actualBankExpense - b.expense);
  }

  const rows = buildRows(buckets, categories, allOccurrences);

  const opening = await getOpeningBalance(tenantId);

  let running = opening;
  const cumulativeBalances = buckets.map((b) => {
    running += b.net;
    return { bucketKey: b.key, balanceClp: running };
  });

  return {
    range,
    buckets,
    rows,
    totals: {
      totalIncome: buckets.reduce((s, b) => s + b.income, 0),
      totalExpense: buckets.reduce((s, b) => s + b.expense, 0),
      totalNet: buckets.reduce((s, b) => s + b.net, 0),
      totalActualIncome: buckets.reduce((s, b) => s + b.actualIncome, 0),
      totalActualExpense: buckets.reduce((s, b) => s + b.actualExpense, 0),
      totalVariance: buckets.reduce((s, b) => s + b.varianceClp, 0),
    },
    openingBalanceClp: opening,
    cumulativeBalances,
  };
}

function buildBuckets(range: ProjectionRange): ProjectionBucket[] {
  const buckets: ProjectionBucket[] = [];
  const seen = new Set<string>();
  const days = eachDayOfInterval({ start: range.from, end: range.to });
  for (const d of days) {
    const k = bucketKeyFor(d, range.granularity);
    if (seen.has(k)) continue;
    seen.add(k);
    const { start, end, label } = bucketBoundsFor(d, range.granularity);
    buckets.push({
      key: k,
      label,
      start,
      end,
      income: 0,
      expense: 0,
      net: 0,
      actualIncome: 0,
      actualExpense: 0,
      varianceClp: 0,
      actualBankIncome: 0,
      actualBankExpense: 0,
      actualBankNet: 0,
      bankVarianceClp: 0,
      occurrences: [],
    });
  }
  return buckets.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function buildRows(
  buckets: ProjectionBucket[],
  categories: FinanceCashflowCategory[],
  occs: VirtualOccurrence[],
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const cat of categories) {
    const filtered = occs.filter((o) => o.categoryId === cat.id || o.categoryCode === cat.code);
    if (filtered.length === 0) continue;
    const values = buckets.map((b) => {
      const amount = filtered
        .filter((o) => o.scheduledDate >= b.start && o.scheduledDate <= b.end)
        .reduce((s, o) => s + o.amountClp, 0);
      return { bucketKey: b.key, amount };
    });

    // Desglose por item — una sub-fila por (itemId | _orphan).
    const byItem = new Map<string, import("./types").ProjectionRowItemDetail>();
    for (const o of filtered) {
      const key = o.itemId ?? "_orphan";
      let detail = byItem.get(key);
      if (!detail) {
        detail = {
          itemId: key,
          itemName: o.name,
          installationId: o.installationId,
          installationName: o.installationName,
          crmAccountId: o.crmAccountId,
          currency: o.currency,
          source: o.source,
          sourceRefCode: null,
          values: buckets.map((b) => ({
            bucketKey: b.key,
            amount: 0,
            actualAmount: null,
            occurrenceId: null,
            scheduledDate: "",
          })),
          total: 0,
          totalActual: 0,
        };
        byItem.set(key, detail);
      }
      const bIdx = buckets.findIndex(
        (b) => o.scheduledDate >= b.start && o.scheduledDate <= b.end,
      );
      if (bIdx === -1) continue;
      detail.values[bIdx].amount += o.amountClp;
      // Guardamos la fecha original de la primera ocurrencia que aporta al
      // bucket. Sirve como identificador estable para materializar la cuota
      // al primer move/amount aunque la occurrence aún no exista en DB.
      if (!detail.values[bIdx].scheduledDate) {
        detail.values[bIdx].scheduledDate = o.scheduledDate.toISOString().slice(0, 10);
      }
      if (o.actualAmountClp !== null) {
        detail.values[bIdx].actualAmount =
          (detail.values[bIdx].actualAmount ?? 0) + o.actualAmountClp;
        detail.totalActual += o.actualAmountClp;
      }
      if (o.id && !detail.values[bIdx].occurrenceId && o.status !== "PAID") {
        detail.values[bIdx].occurrenceId = o.id;
      }
      detail.total += o.amountClp;
    }

    rows.push({
      categoryId: cat.id,
      categoryCode: cat.code,
      categoryName: cat.name,
      kind: cat.kind,
      values,
      total: values.reduce((s, v) => s + v.amount, 0),
      items: Array.from(byItem.values()).sort((a, b) =>
        (a.installationName ?? a.itemName).localeCompare(
          b.installationName ?? b.itemName,
          "es",
        ),
      ),
    });
  }
  return rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "INCOME" ? -1 : 1));
}

async function getOpeningBalance(tenantId: string): Promise<number> {
  const accounts = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true, currency: "CLP" },
    select: { currentBalance: true },
  });
  return accounts.reduce((s, a) => s + Number(a.currentBalance ?? 0), 0);
}
