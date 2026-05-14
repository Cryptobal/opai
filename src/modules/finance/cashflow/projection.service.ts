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
  CumulativeBalancePoint,
  CashflowCellStatus,
} from "./types";
import { eachDayOfInterval } from "date-fns";

import { matchOccurrencesToBankLinks, type BankLinkSlim } from "./account-matcher";
import { resolveCategoryForLink } from "./category-resolver";
import { bulkResolveCategoriesFromAccounts } from "./categoryAccount.service";
import { resolveOpeningBalance } from "./opening-balance.service";
import {
  getRealBankBalanceAt,
  type BalanceSnapshot,
  type BalanceTx,
} from "./real-balance.helper";

type CategoryLite = Pick<
  FinanceCashflowCategory,
  "id" | "code" | "name" | "kind" | "sortOrder" | "isTaxExempt"
>;

/** Tasa de IVA Chile. El flujo de caja muestra montos BRUTOS porque
 *  representa movimiento bancario; los items se guardan en NETO (consistente
 *  con la contabilidad y los contratos firmados). Categorías marcadas como
 *  `isTaxExempt=true` (sueldos, cotizaciones, impuestos, retiros, ajustes)
 *  no aplican IVA porque sus montos ya son valor de caja directo. */
const IVA_RATE = 0.19;

interface DteStatusSlim {
  id: string;
  siiStatus: string;
  paymentStatus: string;
  dueDate: Date | null;
}

/**
 * Precedencia para mergear cellStatus cuando varias cuotas con DTE caen en
 * la misma celda. PAID > CEDED > DRAFT > INVOICED > PROJECTED — mostramos el
 * más informativo desde la óptica financiera del usuario.
 */
const CELL_STATUS_RANK: Record<CashflowCellStatus, number> = {
  PROJECTED: 0,
  INVOICED: 1,
  DRAFT: 2,
  CEDED: 3,
  PAID: 4,
};

/**
 * Resuelve el estado a mostrar en la celda según el DTE vinculado y si tiene
 * factoring activo. La precedencia importa: PAID > CEDED > DRAFT > INVOICED.
 */
function deriveCellStatus(opts: {
  dte: DteStatusSlim | null;
  hasFactoring: boolean;
  today: Date;
}): { status: CashflowCellStatus; daysOverdue: number; dteId: string | null } {
  if (!opts.dte) return { status: "PROJECTED", daysOverdue: 0, dteId: null };
  const { id, siiStatus, paymentStatus, dueDate } = opts.dte;

  if (paymentStatus === "PAID") return { status: "PAID", daysOverdue: 0, dteId: id };
  if (paymentStatus === "CEDED" || opts.hasFactoring) {
    return { status: "CEDED", daysOverdue: 0, dteId: id };
  }
  if (siiStatus === "DRAFT" || siiStatus === "PENDING") {
    return { status: "DRAFT", daysOverdue: 0, dteId: id };
  }
  if (siiStatus === "ACCEPTED") {
    const overdue = dueDate
      ? Math.max(0, Math.floor((opts.today.getTime() - dueDate.getTime()) / 86_400_000))
      : 0;
    return { status: "INVOICED", daysOverdue: overdue, dteId: id };
  }
  return { status: "PROJECTED", daysOverdue: 0, dteId: id };
}

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

/** Información sobre links que no pudieron resolverse a una categoría de
 *  cashflow — se expone en la respuesta de la proyección para que la UI
 *  pueda alertar al usuario y guiarlo a configurar mappings o regenerar
 *  líneas del DTE. */
export interface UnresolvedBankLink {
  bankTransactionId: string;
  transactionDate: Date;
  amountClp: number;
  targetType: string;
  /** dteId si targetType=DTE_*, accountPlanId si EXPENSE/INCOME. */
  targetRef: string | null;
  /** Razón legible: "DTE sin líneas", "cuenta no mapeada", etc. */
  reason: string;
}

async function loadResolvedBankLinks(
  tenantId: string,
  range: ProjectionRange,
  categoryByCode: Map<string, CategoryLite>,
): Promise<{ resolved: BankLinkSlim[]; unresolved: UnresolvedBankLink[] }> {
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

  // Fallbacks "Otros ingresos" / "Otros egresos" para no perder visibilidad
  // de conciliaciones cuando el DTE no tiene líneas o las cuentas no están
  // mapeadas a una categoría. Sin esto, una conciliación masiva contra un
  // DTE sin lines (típico: facturas one-off o importadas desde SII solo
  // con header) queda invisible en el flujo de caja por categoría aunque
  // el banco real sí sume — el usuario lo percibe como "no pasó nada".
  const fallbackIncomeCat = categoryByCode.get("ING_OTRO");
  const fallbackExpenseCat = categoryByCode.get("EGR_OTRO");

  const resolved: BankLinkSlim[] = [];
  const unresolved: UnresolvedBankLink[] = [];
  for (const l of links) {
    const dteAccountIds =
      (l.targetType === "DTE_ISSUED" || l.targetType === "DTE_RECEIVED") && l.targetId
        ? dteLines
            .filter((dl) => dl.dteId === l.targetId && dl.accountId)
            .map((dl) => dl.accountId!)
        : [];
    let cat = resolveCategoryForLink({
      targetType: l.targetType,
      accountPlanId: l.accountPlanId,
      dteAccountIds,
      accountToCategory,
      payrollSueldoCategoryId: sueldoCat?.id ?? null,
      payrollTurnoExtraCategoryId: turnoExtraCat?.id ?? null,
      payrollAnticipoCategoryId: anticipoCat?.id ?? null,
    });

    let unresolvedReason: string | null = null;
    if (!cat) {
      // Fallback derivado del targetType del link. La conciliación masiva
      // contra DTEs crea links con accountPlanId=null confiando en que las
      // líneas del DTE resuelvan la categoría. Si el DTE no tiene líneas
      // o sus accountIds no están mapeados, caemos a la categoría genérica
      // "Otros" del kind correcto en lugar de descartar el link.
      const linksDteNoLines =
        (l.targetType === "DTE_ISSUED" || l.targetType === "DTE_RECEIVED") &&
        l.targetId &&
        dteAccountIds.length === 0;
      const linksDteUnmappedAccounts =
        (l.targetType === "DTE_ISSUED" || l.targetType === "DTE_RECEIVED") &&
        l.targetId &&
        dteAccountIds.length > 0;
      if (l.targetType === "DTE_ISSUED" && fallbackIncomeCat) {
        cat = fallbackIncomeCat as FinanceCashflowCategory;
        unresolvedReason = linksDteNoLines
          ? "DTE emitido sin líneas contables — atribuido a Otros ingresos"
          : "Cuentas del DTE no mapeadas a categoría — atribuido a Otros ingresos";
      } else if (l.targetType === "DTE_RECEIVED" && fallbackExpenseCat) {
        cat = fallbackExpenseCat as FinanceCashflowCategory;
        unresolvedReason = linksDteNoLines
          ? "DTE recibido sin líneas contables — atribuido a Otros egresos"
          : "Cuentas del DTE no mapeadas a categoría — atribuido a Otros egresos";
      } else {
        unresolved.push({
          bankTransactionId: l.bankTransactionId,
          transactionDate: l.bankTransaction.transactionDate,
          amountClp: Math.abs(Number(l.amount)),
          targetType: l.targetType,
          targetRef: l.targetId ?? l.accountPlanId ?? null,
          reason: linksDteUnmappedAccounts
            ? "Cuenta contable del DTE no está mapeada a categoría de flujo de caja"
            : linksDteNoLines
              ? "DTE sin líneas contables (header-only)"
              : "Link sin cuenta ni categoría resoluble",
        });
        continue;
      }
    }

    if (unresolvedReason) {
      unresolved.push({
        bankTransactionId: l.bankTransactionId,
        transactionDate: l.bankTransaction.transactionDate,
        amountClp: Math.abs(Number(l.amount)),
        targetType: l.targetType,
        targetRef: l.targetId ?? l.accountPlanId ?? null,
        reason: unresolvedReason,
      });
    }

    resolved.push({
      bankTransactionId: l.bankTransactionId,
      transactionDate: l.bankTransaction.transactionDate,
      amountClp: Math.abs(Number(l.amount)),
      categoryId: cat.id,
    });
  }
  return { resolved, unresolved };
}

export async function buildProjection(
  tenantId: string,
  range: ProjectionRange,
): Promise<ProjectionMatrix> {
  // Alinea `from` al inicio del bucket que lo contiene (lunes ISO en weekly,
  // día 1 en monthly). Sin esto, si el caller pasa una fecha a mitad de
  // semana, las bank tx y occurrences del inicio de esa misma semana quedan
  // fuera del filtro `gte: from` y el bucket actual aparece con varianza
  // inflada — causa de drifts distintos entre la cuadratura (from=today) y
  // el header de flujo de caja (from=startOfWeek).
  const alignedFrom = bucketBoundsFor(range.from, range.granularity).start;
  range = { ...range, from: alignedFrom };

  const config = await getOrCreateCashflowConfig(tenantId);
  const categories = await listCategories(tenantId);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const codeToCategory = new Map<string, CategoryLite>(
    categories.map((c) => [c.code, c]),
  );

  // Excluimos source=PAYROLL (legacy pre-split): reemplazado por
  // PAYROLL_LIQUIDO + PAYROLL_PREVIRED. Los ítems source=CONTRACT son los
  // contratos CRM vigentes (Document → FinanceCashflowItem vía el tab
  // Contratos de cada cuenta) y deben incluirse en la proyección.
  const allItems = await listItems(tenantId, { isActive: true });
  const itemsAfterPayroll = allItems.filter((i) => i.source !== "PAYROLL");

  // Filtro de items "globales huérfanos" por contrato: cuando un contrato
  // (sourceRefId) tiene items con installationId específico Y además un
  // item con installationId=null, el global es residuo de la migración
  // single→multi y debe IGNORARSE en la proyección (genera doble conteo).
  // Caso real: Polpaico tenía un FC item global de $5.6M creado al subir
  // el contrato + 4 items per-installation; el global aparecía como
  // "Contrato 4420005793 Gard_Cemento Polpaico" aunque ya no representaba
  // valor económico real. El item sigue existiendo en DB (no se borra
  // automáticamente) pero no se proyecta. La UI del tab Contratos lo
  // marca como "Monto antiguo (sin instalación)" para que el usuario lo
  // limpie cuando quiera.
  const orphanGlobalItemIds = new Set<string>();
  {
    const itemsBySourceRef = new Map<string, typeof itemsAfterPayroll>();
    for (const it of itemsAfterPayroll) {
      if (!it.sourceRefId) continue;
      const arr = itemsBySourceRef.get(it.sourceRefId) ?? [];
      arr.push(it);
      itemsBySourceRef.set(it.sourceRefId, arr);
    }
    for (const [, group] of itemsBySourceRef) {
      const hasSpecific = group.some((g) => !!g.installationId);
      if (!hasSpecific) continue;
      for (const g of group) {
        if (!g.installationId) orphanGlobalItemIds.add(g.id);
      }
    }
  }
  const itemsAfterOrphan = itemsAfterPayroll.filter(
    (i) => !orphanGlobalItemIds.has(i.id),
  );

  // Deduplicación CONTRACT ↔ RECURRING_DTE: el flujo de caja se alimenta
  // desde el tab Contratos de la ficha de cuenta CRM. Cuando un contrato
  // ya emite un item `source=CONTRACT`, una plantilla DTE recurrente
  // (`source=RECURRING_DTE`) del mismo cliente+instalación es duplicado:
  // probablemente se creó al integrar contrato → factura recurrente SII y
  // queda viva en `FinanceDteRecurringTemplate` para timbraje, pero NO
  // debe sumar ingreso paralelo en la proyección. La clave de dedup es
  // (crmAccountId, installationId): cubre el caso típico de un cliente
  // con contrato + plantilla para la misma instalación.
  const contractKeys = new Set<string>();
  for (const it of itemsAfterOrphan) {
    if (it.source === "CONTRACT" && it.crmAccountId) {
      contractKeys.add(`${it.crmAccountId}|${it.installationId ?? ""}`);
    }
  }
  const items = itemsAfterOrphan.filter((i) => {
    if (i.source !== "RECURRING_DTE") return true;
    if (!i.crmAccountId) return true;
    return !contractKeys.has(`${i.crmAccountId}|${i.installationId ?? ""}`);
  });
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

  // Dotación por instalación (headcount planificado) — SUM(requiredGuards)
  // de OpsPuestoOperativo activos. Cada puesto-turno cuenta como 1+ personas
  // (`requiredGuards` permite multi-guardia en un mismo turno). Sirve para
  // mostrar "· N personas" en cada línea de contrato/instalación y sumar al
  // colapsar el cliente. Una sola query agregada por la lista de
  // instalaciones que aparecen en la proyección.
  const headcountRows =
    installationIds.length > 0
      ? await prisma.opsPuestoOperativo.groupBy({
          by: ["installationId"],
          where: {
            tenantId,
            installationId: { in: installationIds },
            active: true,
          },
          _sum: { requiredGuards: true },
        })
      : [];
  const headcountByInstallation = new Map<string, number>(
    headcountRows.map((r) => [r.installationId, r._sum.requiredGuards ?? 0]),
  );

  // Mapeo crmAccountId → name para agrupar en UI por cliente (Fase C.3).
  const crmAccountIds = Array.from(
    new Set(items.map((i) => i.crmAccountId).filter((x): x is string => !!x)),
  );
  const crmAccounts =
    crmAccountIds.length > 0
      ? await prisma.crmAccount.findMany({
          where: { tenantId, id: { in: crmAccountIds } },
          select: { id: true, name: true },
        })
      : [];
  const crmAccountNameById = new Map(crmAccounts.map((a) => [a.id, a.name]));
  const materialized = await listMaterializedOccurrences(
    tenantId,
    range.from,
    range.to,
    items.map((i) => i.id),
  );

  // ── Reajuste IPC esperado (items CLP con hasIpcAdjustment=true) ──
  // Pre-cargamos para cada item con ajuste IPC el último ajuste APPLIED
  // (define la base + fecha del último reajuste real). Sirve para
  // proyectar las cuotas futuras con incremento compuesto sin esperar a
  // que el usuario aplique manualmente cada ajuste.
  const ipcItemIds = items
    .filter((i) => i.hasIpcAdjustment && i.currency === "CLP")
    .map((i) => i.id);
  const lastIpcByItem = new Map<
    string,
    { appliedAt: Date; newAmount: number }
  >();
  if (ipcItemIds.length > 0) {
    const lastApplied = await prisma.financeContractIpcAdjustment.findMany({
      where: {
        tenantId,
        itemId: { in: ipcItemIds },
        status: "APPLIED",
        newAmount: { not: null },
        appliedAt: { not: null },
      },
      select: { itemId: true, appliedAt: true, newAmount: true },
      orderBy: { appliedAt: "desc" },
    });
    for (const a of lastApplied) {
      if (!a.appliedAt || a.newAmount == null) continue;
      if (!lastIpcByItem.has(a.itemId)) {
        lastIpcByItem.set(a.itemId, {
          appliedAt: a.appliedAt,
          newAmount: Number(a.newAmount),
        });
      }
    }
  }
  const ipcAnnualPct = Number(config.ipcExpectedAnnualPct ?? 0);
  const monthsBetween = (from: Date, to: Date): number => {
    return (
      (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - from.getUTCMonth())
    );
  };
  /**
   * Calcula el monto estimado de una cuota CLP de un contrato con reajuste
   * IPC. Aplica incremento compuesto basado en cuántos ciclos de ajuste
   * (cada `ipcAdjustmentMonths`) caben entre la fecha base y la cuota.
   *
   * - Base: último ajuste APPLIED si existe, si no `item.startDate` y
   *   `item.amount` (asumimos que `amount` ya está actualizado al último).
   * - El reajuste se aplica SOLO en ciclos completos futuros — la cuota
   *   actual mantiene la base hasta que se cumpla el próximo ciclo.
   */
  const projectIpcAdjustedAmount = (
    item: (typeof items)[number],
    cuotaDate: Date,
    baseAmount: number
  ): number => {
    if (!item.hasIpcAdjustment || item.currency !== "CLP") return baseAmount;
    if (!ipcAnnualPct || ipcAnnualPct <= 0) return baseAmount;
    const cycleMonths = Number(item.ipcAdjustmentMonths ?? 12);
    if (cycleMonths <= 0) return baseAmount;
    const last = lastIpcByItem.get(item.id);
    const baseDate = last?.appliedAt ?? item.startDate;
    const base = last?.newAmount ?? baseAmount;
    const elapsed = monthsBetween(baseDate, cuotaDate);
    if (elapsed <= 0) return base;
    const cycles = Math.floor(elapsed / cycleMonths);
    if (cycles <= 0) return base;
    const pctPerCycle = (ipcAnnualPct * cycleMonths) / 12 / 100;
    return base * Math.pow(1 + pctPerCycle, cycles);
  };
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
      // Las ocurrencias CANCELLED están materializadas pero el usuario las
      // eliminó individualmente. No se proyectan, pero el item sigue activo
      // y sus otras cuotas se mantienen.
      if (mat?.status === "CANCELLED") continue;

      let amountClp: number;
      let ufValue: number | null = null;
      const itemAmount = Number(item.amount);
      if (item.currency === "UF") {
        ufValue = mat?.ufValueUsed
          ? Number(mat.ufValueUsed)
          : await resolveUfForOccurrence(item.ufFixingPolicy, item.ufFixingDay, d);
        // Fase D: para meses futuros aplicamos crecimiento compuesto al
        // valor UF cuando el tenant configuró `ufMonthlyGrowthPct`. La UF
        // real se respeta para el mes actual y pasados; sólo se proyecta
        // hacia adelante. La fecha de corte es el primer día del mes
        // siguiente al actual (no aplicamos al mes en curso).
        const growthPct = Number(config.ufMonthlyGrowthPct ?? 0);
        if (!mat?.ufValueUsed && growthPct > 0) {
          const now = new Date();
          const refMonthStart = new Date(
            now.getUTCFullYear(),
            now.getUTCMonth() + 1,
            1,
          );
          if (d >= refMonthStart) {
            const monthsAhead =
              (d.getUTCFullYear() - now.getUTCFullYear()) * 12 +
              (d.getUTCMonth() - now.getUTCMonth());
            if (monthsAhead > 0) {
              ufValue = ufValue * Math.pow(1 + growthPct / 100, monthsAhead);
            }
          }
        }
        const baseUf = mat?.amountOverride !== null && mat?.amountOverride !== undefined
          ? Number(mat.amountOverride)
          : itemAmount;
        amountClp = mat?.amountClp !== undefined && mat?.amountClp !== null
          ? Number(mat.amountClp)
          : baseUf * ufValue;
      } else {
        const baseClp =
          mat?.amountOverride !== null && mat?.amountOverride !== undefined
            ? Number(mat.amountOverride)
            : itemAmount;
        if (mat?.amountClp !== undefined && mat?.amountClp !== null) {
          // Si la cuota ya fue materializada (o el cron de IPC la ajustó
          // explícitamente), respetamos el monto guardado.
          amountClp = Number(mat.amountClp);
        } else {
          // Sin materializada: estimamos el reajuste IPC futuro para items
          // CLP con hasIpcAdjustment=true. Si el item no tiene ajuste, esto
          // retorna baseClp sin tocar.
          amountClp = projectIpcAdjustedAmount(item, d, baseClp);
        }
      }
      const cat = categoryMap.get(item.categoryId);
      // IVA: el cashflow muestra valores BRUTOS porque proyecta movimiento
      // bancario real. Los items en BD están en NETO (consistentes con
      // contabilidad). Para categorías no exentas aplicamos ×1.19.
      // EXCEPCIÓN: cuando el usuario hizo un override manual (`amountOverride`)
      // —vía "Editar monto" o "Igualar a factura"— el monto guardado ES el
      // bruto que el usuario quiere ver. Si re-aplicáramos IVA acá, el cell
      // quedaría a 1.19× lo que el usuario pidió. Por eso saltamos el IVA
      // cuando hay override.
      const hasManualOverride =
        mat?.amountOverride !== null && mat?.amountOverride !== undefined;
      if (cat && !cat.isTaxExempt && !hasManualOverride) {
        amountClp = amountClp * (1 + IVA_RATE);
      }
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
        // `amountOriginal` representa el monto BASE del contrato en su moneda
        // original (UF para contratos UF, CLP para contratos CLP). Alimenta
        // el header del row ("UF 76,91/mes" / "$5.600.000/mes"), por lo que
        // NUNCA debe contener el override por celda (que vive en CLP). El
        // override aplica solo a `amountClp` de la ocurrencia individual.
        amountOriginal: itemAmount,
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
        hasIpcAdjustment: !!item.hasIpcAdjustment,
        ipcAdjustmentMonths: item.ipcAdjustmentMonths ?? null,
        dteId: mat?.dteId ?? null,
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
  const { resolved: bankLinks, unresolved: unresolvedBankLinks } =
    await loadResolvedBankLinks(tenantId, range, codeToCategory);
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

  const consumedBankTxIds = new Set(
    matched.map((m) => m.bankTransactionId).filter(Boolean) as string[],
  );
  // También consumidos: bank txs ya linkeados en DB a occurrences materializadas
  // (vía bulkReconcileToDtes/Dte que invoca linkOccurrenceToBankTx). Sin esto
  // el orphan loop generaría un duplicado en ING_OTRO/EGR_OTRO.
  for (const occ of allOccurrences) {
    if (occ.bankTransactionId && occ.itemId) {
      consumedBankTxIds.add(occ.bankTransactionId);
    }
  }

  // ── DTE-targeted matcher por cliente (RUT → CRM account → item) ──
  // El matcher account-driven empareja por categoría contable, lo que falla
  // cuando: (a) el DTE no tiene líneas con accountId; (b) la conciliación
  // masiva N→N genera N links contra el mismo DTE y solo uno puede matchear
  // la única occurrence proyectada del cliente; (c) el DTE no tiene
  // crmAccountId seteado pero su receiverRut sí coincide con un CrmAccount.
  // Acá hacemos un pase adicional: para cada DTE conciliado, ubicamos su
  // cliente CRM (directo o via RUT), buscamos el item de cashflow activo y
  // emparejamos su occurrence PROJECTED más cercana en fecha, sumando los
  // montos de TODOS los bank-txs del mismo DTE como actualAmount.
  const dteTargetedLinks = await prisma.financeBankTransactionLink.findMany({
    where: {
      tenantId,
      targetType: { in: ["DTE_ISSUED", "DTE_RECEIVED"] },
      targetId: { not: null },
      bankTransaction: {
        transactionDate: { gte: range.from, lte: range.to },
        hiddenAt: null,
      },
    },
    select: {
      bankTransactionId: true,
      targetType: true,
      targetId: true,
      amount: true,
      bankTransaction: { select: { transactionDate: true, amount: true } },
    },
  });

  if (dteTargetedLinks.length > 0) {
    type DteLinkAgg = {
      dteId: string;
      isIncome: boolean;
      totalAmount: number;
      bankTxs: Array<{ id: string; date: Date }>;
    };
    const dteLinkAgg = new Map<string, DteLinkAgg>();
    for (const l of dteTargetedLinks) {
      if (!l.targetId) continue;
      // Excluir links cuyo bank tx ya fue consumido por el matcher account-driven
      // o por un linkOccurrenceToBankTx previo. Aún consideramos el DTE si
      // OTRO bank tx del mismo lote sigue libre (caso N→N parcial).
      const isIncome = l.targetType === "DTE_ISSUED";
      const agg = dteLinkAgg.get(l.targetId) ?? {
        dteId: l.targetId,
        isIncome,
        totalAmount: 0,
        bankTxs: [],
      };
      agg.totalAmount += Math.abs(Number(l.amount));
      agg.bankTxs.push({
        id: l.bankTransactionId,
        date: l.bankTransaction.transactionDate,
      });
      dteLinkAgg.set(l.targetId, agg);
    }

    // Solo procesar DTEs cuyos bank txs no estén TODOS ya consumidos.
    const dtesToResolve = Array.from(dteLinkAgg.values()).filter((agg) =>
      agg.bankTxs.some((tx) => !consumedBankTxIds.has(tx.id)),
    );

    if (dtesToResolve.length > 0) {
      const dteIdsToResolve = dtesToResolve.map((d) => d.dteId);
      const dteInfos = await prisma.financeDte.findMany({
        where: { tenantId, id: { in: dteIdsToResolve } },
        select: {
          id: true,
          crmAccountId: true,
          installationId: true,
          receiverRut: true,
          paymentStatus: true,
        },
      });

      // Backfill crmAccountId por receiverRut cuando viene null
      const rutsNeedingLookup = dteInfos
        .filter((d) => !d.crmAccountId && d.receiverRut)
        .map((d) => d.receiverRut!)
        .filter((r, i, arr) => arr.indexOf(r) === i);
      const crmByRut = new Map<string, string>();
      if (rutsNeedingLookup.length > 0) {
        const accs = await prisma.crmAccount.findMany({
          where: { tenantId, rut: { in: rutsNeedingLookup } },
          select: { id: true, rut: true },
        });
        for (const a of accs) if (a.rut) crmByRut.set(a.rut, a.id);
      }

      const dteToCrmAccount = new Map<string, string>();
      const dteToInstallation = new Map<string, string | null>();
      for (const d of dteInfos) {
        const crmAccountId =
          d.crmAccountId ?? (d.receiverRut ? (crmByRut.get(d.receiverRut) ?? null) : null);
        if (crmAccountId) dteToCrmAccount.set(d.id, crmAccountId);
        dteToInstallation.set(d.id, d.installationId);
      }

      // Index para búsqueda rápida de occurrences PROJECTED por itemId
      const occsByItemId = new Map<string, VirtualOccurrence[]>();
      for (const occ of allOccurrences) {
        if (!occ.itemId) continue;
        if (occ.status !== "PROJECTED") continue;
        if (occ.bankTransactionId) continue;
        const arr = occsByItemId.get(occ.itemId) ?? [];
        arr.push(occ);
        occsByItemId.set(occ.itemId, arr);
      }

      // Index items activos por crmAccountId (already in memory: items array)
      const itemsByCrmAccount = new Map<string, typeof items>();
      for (const it of items) {
        if (!it.crmAccountId) continue;
        const arr = itemsByCrmAccount.get(it.crmAccountId) ?? [];
        arr.push(it);
        itemsByCrmAccount.set(it.crmAccountId, arr);
      }

      const MAX_DAYS_TOLERANCE = 60;
      for (const agg of dtesToResolve) {
        const crmAccountId = dteToCrmAccount.get(agg.dteId);
        if (!crmAccountId) continue;
        const itemCandidates = itemsByCrmAccount.get(crmAccountId) ?? [];
        if (itemCandidates.length === 0) continue;
        const installationId = dteToInstallation.get(agg.dteId) ?? null;
        const filteredItems = installationId
          ? itemCandidates.filter(
              (it) =>
                it.installationId === installationId || it.installationId === null,
            )
          : itemCandidates;
        const itemIds = (filteredItems.length > 0 ? filteredItems : itemCandidates).map(
          (it) => it.id,
        );

        const firstTx = [...agg.bankTxs].sort(
          (a, b) => a.date.getTime() - b.date.getTime(),
        )[0];
        const txDateMs = firstTx.date.getTime();

        let best: { occ: VirtualOccurrence; days: number } | null = null;
        for (const itemId of itemIds) {
          const candidates = occsByItemId.get(itemId) ?? [];
          for (const c of candidates) {
            const days =
              Math.abs(c.scheduledDate.getTime() - txDateMs) / 86_400_000;
            if (days > MAX_DAYS_TOLERANCE) continue;
            if (!best || days < best.days) best = { occ: c, days };
          }
        }

        if (best) {
          // Mark PAID con monto agregado (suma de TODOS los bank txs del DTE)
          best.occ.status = "PAID";
          best.occ.bankTransactionId = firstTx.id;
          best.occ.actualAmountClp = agg.totalAmount;
          best.occ.varianceClp = agg.totalAmount - best.occ.amountClp;
          best.occ.effectiveDate = firstTx.date;
          best.occ.dteId = agg.dteId;
          for (const tx of agg.bankTxs) consumedBankTxIds.add(tx.id);
          // Remover de occsByItemId para evitar doble-match si hay otra DTE
          // del mismo cliente.
          const arr = occsByItemId.get(best.occ.itemId!) ?? [];
          const idx = arr.indexOf(best.occ);
          if (idx >= 0) arr.splice(idx, 1);
        }
      }
    }
  }

  // Bank-links HUÉRFANOS: links bancarios con categoría resuelta que NO
  // matchearon ninguna occurrence proyectada. Típico: costo factoring
  // shortfall, comisión recibida surplus, gastos categorizados manualmente
  // sin item proyectado. Los exponemos como occurrences sintéticas PAID
  // (itemId=null, status=PAID) para que sumen a su categoría en el bucket
  // de la fecha del bank-tx. Sin esto, esos costos no aparecen en cashflow.
  for (const link of bankLinks) {
    if (consumedBankTxIds.has(link.bankTransactionId)) continue;
    const cat = categoryMap.get(link.categoryId);
    if (!cat) continue;
    allOccurrences.push({
      id: null,
      itemId: null,
      source: "MANUAL",
      categoryId: cat.id,
      categoryCode: cat.code,
      categoryName: cat.name,
      kind: cat.kind,
      name: `Conciliación · ${cat.name}`,
      description: null,
      scheduledDate: link.transactionDate,
      effectiveDate: link.transactionDate,
      amountClp: link.amountClp,
      amountOriginal: link.amountClp,
      currency: "CLP",
      ufValueUsed: null,
      status: "PAID",
      installationId: null,
      installationName: null,
      crmAccountId: null,
      bankTransactionId: link.bankTransactionId,
      isVirtual: true,
      isAutoGenerated: true,
      actualAmountClp: link.amountClp,
      varianceClp: 0,
      hasIpcAdjustment: false,
      ipcAdjustmentMonths: null,
      dteId: null,
    });
  }

  const buckets = buildBuckets(range);
  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));

  for (const occ of allOccurrences) {
    // Usamos effectiveDate cuando existe — refleja la fecha REAL en que la
    // cuota se ejecutó (rebalanceada al conciliar), no la fecha programada
    // original. Esto hace que la matriz "siga al banco" cuando hay atrasos.
    const placementDate = occ.effectiveDate ?? occ.scheduledDate;
    const key = bucketKeyFor(placementDate, range.granularity);
    const idx = bucketIndex.get(key);
    if (idx === undefined) continue;
    const b = buckets[idx];
    // ¿Esta occurrence ya está "explicada" por el banco real? Eso ocurre
    // cuando matchOccurrencesToBankLinks la marcó PAID con un
    // bankTransactionId — la plata YA está sumada en
    // actualBankIncome/Expense (loop más abajo lee tx.amount directo).
    // Para evitar doble conteo, salteamos su contribución a
    // income/expense proyectados.
    //
    // EXCEPCIONES (sí suman a income/expense):
    //   1. source=AJUSTE: ajustes contables virtuales sin banco-real.
    //   2. itemId=null (orphan synthetic): occurrences sintéticas creadas
    //      a partir de bank-links huérfanos (costo factoring shortfall,
    //      comisión recibida surplus, categorizados manuales) — son la
    //      ÚNICA forma de exponer ese flujo bancario en su categoría.
    const alreadyInBankReal =
      occ.status === "PAID" &&
      occ.bankTransactionId !== null &&
      occ.itemId !== null &&
      occ.source !== "AJUSTE";
    if (!alreadyInBankReal) {
      if (occ.kind === "INCOME") {
        b.income += occ.amountClp;
        if (occ.actualAmountClp !== null) b.actualIncome += occ.actualAmountClp;
      } else {
        b.expense += occ.amountClp;
        if (occ.actualAmountClp !== null) b.actualExpense += occ.actualAmountClp;
      }
    } else {
      // PAID & en banco real: el monto efectivo es el del bank-tx — lo
      // exponemos en actualIncome/actualExpense para que la UI muestre
      // "real cobrado/pagado" sin alterar el total proyectado.
      const realAmt = occ.actualAmountClp ?? occ.amountClp;
      if (occ.kind === "INCOME") b.actualIncome += realAmt;
      else b.actualExpense += realAmt;
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

  // Bulk-load DTE status + factoring activo para derivar cellStatus por celda.
  // Recolectamos dteIds únicos de las occurrences (sólo las materializadas
  // tienen vínculo). Si no hay ninguno, saltamos las consultas.
  const dteIds = Array.from(
    new Set(
      allOccurrences
        .map((o) => o.dteId)
        .filter((x): x is string => !!x),
    ),
  );
  const dteStatusById = new Map<string, DteStatusSlim>();
  const dteFolioById = new Map<string, number | null>();
  const dteGrossById = new Map<string, number>();
  const activeFactoringDteIds = new Set<string>();
  if (dteIds.length > 0) {
    const [dtes, factoringOps] = await Promise.all([
      prisma.financeDte.findMany({
        where: { tenantId, id: { in: dteIds } },
        select: {
          id: true,
          siiStatus: true,
          paymentStatus: true,
          dueDate: true,
          folio: true,
          dteType: true,
          totalAmount: true,
        },
      }),
      prisma.financeFactoringOperation.findMany({
        where: {
          tenantId,
          dteId: { in: dteIds },
          status: { in: ["APPROVED", "FUNDED", "COLLECTED"] },
        },
        select: { dteId: true },
      }),
    ]);
    for (const d of dtes) {
      dteStatusById.set(d.id, {
        id: d.id,
        siiStatus: d.siiStatus,
        paymentStatus: d.paymentStatus,
        dueDate: d.dueDate,
      });
      dteFolioById.set(d.id, d.folio ?? null);
      dteGrossById.set(d.id, Number(d.totalAmount));
    }
    for (const f of factoringOps) {
      if (f.dteId) activeFactoringDteIds.add(f.dteId);
    }
  }
  const cellStatusByDteId = new Map<
    string,
    { status: CashflowCellStatus; daysOverdue: number; dteId: string | null }
  >();
  const todayForStatus = new Date();
  todayForStatus.setHours(0, 0, 0, 0);
  for (const id of dteIds) {
    cellStatusByDteId.set(
      id,
      deriveCellStatus({
        dte: dteStatusById.get(id) ?? null,
        hasFactoring: activeFactoringDteIds.has(id),
        today: todayForStatus,
      }),
    );
  }

  const rows = buildRows(
    buckets,
    categories,
    allOccurrences,
    crmAccountNameById,
    cellStatusByDteId,
    headcountByInstallation,
    dteFolioById,
    dteGrossById,
  );

  const openingBreakdown = await resolveOpeningBalance(tenantId);
  const opening = openingBreakdown.totalClp;

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  // Snapshots de saldo: necesarios para calcular el saldo real por bucket de
  // forma independiente (no acumulativa). El algoritmo previo arrancaba en
  // `opening` (que ya es el saldo de hoy) y sumaba `actualBankNet` de cada
  // bucket pasado — eso duplicaba la plata. Ver `real-balance.helper.ts`.
  const activeAccountsForBalance = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true, currency: "CLP" },
    select: { id: true },
  });
  const accountIds = activeAccountsForBalance.map((a) => a.id);

  const allSnapshots = accountIds.length > 0
    ? await prisma.financeBankAccountBalance.findMany({
        where: {
          tenantId,
          bankAccountId: { in: accountIds },
          asOfDate: { lte: range.to },
        },
        orderBy: { asOfDate: "asc" },
        select: { bankAccountId: true, asOfDate: true, balance: true },
      })
    : [];

  const snapshotsByAccount = new Map<string, BalanceSnapshot[]>();
  for (const s of allSnapshots) {
    const arr = snapshotsByAccount.get(s.bankAccountId) ?? [];
    arr.push({ asOfDate: s.asOfDate, balance: Number(s.balance) });
    snapshotsByAccount.set(s.bankAccountId, arr);
  }

  // Carga ampliada de tx (indexada por cuenta) para reconstruir el saldo
  // desde el snapshot más antiguo relevante. Esta carga es independiente
  // de `bankTxs` (que sigue usándose para actualBankIncome/Expense).
  const oldestSnapshotDate = allSnapshots[0]?.asOfDate ?? range.from;
  const minTxDate =
    oldestSnapshotDate < range.from ? oldestSnapshotDate : range.from;

  const allBankTxs = accountIds.length > 0
    ? await prisma.financeBankTransaction.findMany({
        where: {
          tenantId,
          bankAccountId: { in: accountIds },
          hiddenAt: null,
          transactionDate: { gt: minTxDate, lte: range.to },
        },
        select: { bankAccountId: true, transactionDate: true, amount: true },
        orderBy: { transactionDate: "asc" },
      })
    : [];

  const txsByAccount = new Map<string, BalanceTx[]>();
  for (const t of allBankTxs) {
    const arr = txsByAccount.get(t.bankAccountId) ?? [];
    arr.push({ transactionDate: t.transactionDate, amount: Number(t.amount) });
    txsByAccount.set(t.bankAccountId, arr);
  }

  let runningProjected = opening;
  let lastRealBucketIdx = -1;
  const cumulativePoints: CumulativeBalancePoint[] = buckets.map((b, idx) => {
    runningProjected += b.net;

    const isPastOrCurrent = b.start.getTime() <= todayMidnight.getTime();
    if (!isPastOrCurrent) {
      return {
        bucketKey: b.key,
        projectedClp: runningProjected,
        realBankClp: null,
        cumulativeBankVarianceClp: null,
      };
    }

    // Para buckets pasados/actuales, calculamos el saldo real al cierre del
    // bucket de forma independiente. Si b.end > today (caso del bucket
    // actual), recortamos a hoy: el saldo real sólo va hasta hoy.
    const cutoff =
      b.end.getTime() <= todayMidnight.getTime() ? b.end : todayMidnight;

    const realBank = getRealBankBalanceAt(
      cutoff,
      accountIds,
      snapshotsByAccount,
      txsByAccount,
    );

    lastRealBucketIdx = idx;
    return {
      bucketKey: b.key,
      projectedClp: runningProjected,
      realBankClp: realBank,
      cumulativeBankVarianceClp:
        realBank !== null ? realBank - runningProjected : null,
    };
  });

  const currentDriftClp =
    lastRealBucketIdx >= 0
      ? cumulativePoints[lastRealBucketIdx].cumulativeBankVarianceClp
      : null;

  const cumulativeBalances = cumulativePoints.map((p) => ({
    bucketKey: p.bucketKey,
    balanceClp: p.projectedClp,
  }));

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
      currentDriftClp,
    },
    openingBalanceClp: opening,
    openingBreakdown,
    cumulativeBalances,
    cumulativePoints,
    unresolvedBankLinks,
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
  crmAccountNameById: Map<string, string>,
  cellStatusByDteId: Map<
    string,
    { status: CashflowCellStatus; daysOverdue: number; dteId: string | null }
  >,
  headcountByInstallation: Map<string, number>,
  dteFolioById: Map<string, number | null>,
  dteGrossById: Map<string, number>,
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  for (const cat of categories) {
    if (!cat.isActive) continue;
    const filtered = occs.filter((o) => o.categoryId === cat.id || o.categoryCode === cat.code);
    // Mostramos todas las categorías activas configuradas, incluso sin
    // ocurrencias. Esto permite al usuario ver el plan completo de su
    // flujo de caja y agregar movimientos a categorías vacías sin tener
    // que volver a la configuración para confirmar que existen.
    const values = buckets.map((b) => {
      const amount = filtered
        .filter((o) => {
          const d = o.effectiveDate ?? o.scheduledDate;
          return d >= b.start && d <= b.end;
        })
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
          crmAccountName: o.crmAccountId
            ? (crmAccountNameById.get(o.crmAccountId) ?? null)
            : null,
          baseAmount: o.amountOriginal ?? o.amountClp,
          currency: o.currency,
          source: o.source,
          sourceRefCode: null,
          hasIpcAdjustment: o.hasIpcAdjustment,
          ipcAdjustmentMonths: o.ipcAdjustmentMonths,
          headcount: o.installationId
            ? (headcountByInstallation.get(o.installationId) ?? 0)
            : 0,
          values: buckets.map((b) => ({
            bucketKey: b.key,
            amount: 0,
            actualAmount: null,
            occurrenceId: null,
            scheduledDate: "",
            cellStatus: "PROJECTED" as CashflowCellStatus,
            dteId: null,
            dteFolio: null,
            dteGrossAmount: null,
            daysOverdue: 0,
          })),
          total: 0,
          totalActual: 0,
        };
        byItem.set(key, detail);
      }
      const placementDate = o.effectiveDate ?? o.scheduledDate;
      const bIdx = buckets.findIndex(
        (b) => placementDate >= b.start && placementDate <= b.end,
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
      // cellStatus: si la occurrence tiene DTE vinculado, derivamos el estado
      // y lo mergeamos con el actual de la celda. Precedencia: PAID > CEDED >
      // DRAFT > INVOICED > PROJECTED. Mostramos el "más informativo" si caen
      // varias cuotas en la misma celda.
      if (o.dteId) {
        const derived = cellStatusByDteId.get(o.dteId);
        if (derived) {
          const cell = detail.values[bIdx];
          const current = cell.cellStatus ?? "PROJECTED";
          if (CELL_STATUS_RANK[derived.status] > CELL_STATUS_RANK[current]) {
            cell.cellStatus = derived.status;
            cell.dteId = derived.dteId;
            cell.dteFolio = derived.dteId
              ? (dteFolioById.get(derived.dteId) ?? null)
              : null;
            cell.dteGrossAmount = derived.dteId
              ? (dteGrossById.get(derived.dteId) ?? null)
              : null;
            cell.daysOverdue = derived.daysOverdue;
          } else if (
            derived.status === "INVOICED" &&
            current === "INVOICED" &&
            (derived.daysOverdue ?? 0) > (cell.daysOverdue ?? 0)
          ) {
            cell.daysOverdue = derived.daysOverdue;
          }
        }
        // Si aún no hay folio capturado y este DTE tiene uno conocido, lo
        // exponemos para que el tooltip de la celda lo muestre aunque el
        // cellStatus no haya cambiado (por ejemplo, DTE PAID cuya celda ya
        // estaba marcada PAID por otra cuota).
        if (!detail.values[bIdx].dteFolio) {
          const folio = dteFolioById.get(o.dteId);
          if (folio) detail.values[bIdx].dteFolio = folio;
        }
        if (!detail.values[bIdx].dteGrossAmount) {
          const gross = dteGrossById.get(o.dteId);
          if (gross) detail.values[bIdx].dteGrossAmount = gross;
        }
      }
    }

    rows.push({
      categoryId: cat.id,
      categoryCode: cat.code,
      categoryName: cat.name,
      kind: cat.kind,
      values,
      total: values.reduce((s, v) => s + v.amount, 0),
      // Ordenamos PRIMERO por cliente (los sin cliente al final) y luego
      // por instalación/nombre, para que la sub-fila se vea agrupada por
      // cuenta CRM dentro de la categoría.
      items: Array.from(byItem.values()).sort((a, b) => {
        const an = a.crmAccountName ?? "￿";
        const bn = b.crmAccountName ?? "￿";
        if (an !== bn) return an.localeCompare(bn, "es");
        return (a.installationName ?? a.itemName).localeCompare(
          b.installationName ?? b.itemName,
          "es",
        );
      }),
    });
  }
  return rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "INCOME" ? -1 : 1));
}

