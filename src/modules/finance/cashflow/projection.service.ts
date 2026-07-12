import "server-only";
import { prisma } from "@/lib/prisma";
import { listItems } from "./item.service";
import { listMaterializedOccurrences } from "./occurrence.service";
import { listCategories } from "./category.service";
import { getOrCreateCashflowConfig } from "./config.service";
import {
  expandRecurrence,
  itemForRecurrenceExpansion,
  bucketKeyFor,
  bucketBoundsFor,
  utcCalendarDay,
} from "./recurrence-engine";
import { filterCashflowItemsForProjection } from "./projection-item-filter";
import { occurrenceBucketKey } from "./bucket-matcher";
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
import { computeCreditNoteImpact } from "../billing/credit-note-impact.helper";
import { loadDteDateOverrides } from "./dte-date-override.service";

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

/**
 * Fase 4 — El flujo de caja ya NO auto-proyecta el reajuste IPC esperado hacia
 * el futuro. El reajuste se gestiona manualmente desde Programación (el cron
 * solo avisa). Mantenemos el tramo histórico real (ajustes APPLIED) para no
 * falsear la varianza de períodos pasados, pero los montos futuros quedan
 * planos hasta que el usuario los actualice en la plantilla.
 *
 * Flag (no se borra el código) por si hay que re-encender la proyección
 * mientras se migran los datos. Se elimina una vez confirmada la migración.
 */
const PROJECT_IPC_FORWARD: boolean = false;

interface DteStatusSlim {
  id: string;
  siiStatus: string;
  paymentStatus: string;
  dueDate: Date | null;
  voidedByCreditNoteId: string | null;
  creditedNetAmount: number;
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
  VOIDED: 5,
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

  if (opts.dte.voidedByCreditNoteId) {
    return { status: "VOIDED", daysOverdue: 0, dteId: id };
  }

  if (paymentStatus === "PAID") return { status: "PAID", daysOverdue: 0, dteId: id };
  if (paymentStatus === "CEDED" || opts.hasFactoring) {
    return { status: "CEDED", daysOverdue: 0, dteId: id };
  }
  // Únicamente DRAFT (sin folio, no enviada al SII) es "Borrador" visual.
  // PENDING / SENT / ACCEPTED / WITH_OBJECTIONS son emitidas: tienen folio
  // y van a INVOICED (visualmente "Facturada"). El sub-estado "Pendiente
  // aceptación SII" se distingue en la vista de DTEs Emitidos, no en el
  // flujo de caja donde lo que importa es: ¿ya se emitió o no?
  if (siiStatus === "DRAFT") {
    return { status: "DRAFT", daysOverdue: 0, dteId: id };
  }
  if (
    siiStatus === "PENDING" ||
    siiStatus === "SENT" ||
    siiStatus === "ACCEPTED" ||
    siiStatus === "WITH_OBJECTIONS"
  ) {
    const overdue = dueDate
      ? Math.max(0, Math.floor((opts.today.getTime() - dueDate.getTime()) / 86_400_000))
      : 0;
    return { status: "INVOICED", daysOverdue: overdue, dteId: id };
  }
  // REJECTED / ANNULLED: no deberían llegar acá (filtradas en orphanDtes
  // por siiStatus: { notIn: ['ANNULLED', 'REJECTED'] }). Defensivo:
  // si llegaran, no tiene sentido mostrar badge — caen a PROJECTED.
  return { status: "PROJECTED", daysOverdue: 0, dteId: id };
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

/** Item MANUAL de egreso creado por `assignBankTxToCategory` (rama "real
 *  puro"): sin cliente ni instalación y con bank-tx enganchado. Su `name`
 *  es la glosa del banco (ej. "Compra OPENAI* CHATGPT C"), no una cuenta
 *  contable, por lo que la grilla de EGRESOS lo colapsa dentro de su cuenta
 *  en vez de darle fila propia. No matchea gastos manuales legítimos que el
 *  usuario cargó a mano y aún NO concilió (esos no tienen bankTransactionId). */
export function isBankBornManualExpense(
  item: {
    source: string;
    kind: string;
    crmAccountId: string | null;
    installationId: string | null;
  },
  bankTransactionId: string | null,
): boolean {
  return (
    item.source === "MANUAL" &&
    item.kind === "EXPENSE" &&
    item.crmAccountId == null &&
    item.installationId == null &&
    bankTransactionId != null
  );
}

/**
 * Marca la 2ª+ factura (`isExtraInvoice`) cuando ≥2 DTEs de la misma
 * CUENTA+INSTALACIÓN caen en el mismo bucket. Antes se agrupaba por item de
 * contrato, lo que dejaba "sueltas" las facturas de distinto item (o sin item)
 * de una misma cuenta: cada una armaba su propia fila desanclada. Ahora la
 * regla es por cuenta+instalación e incluye facturas huérfanas (`itemId=null`),
 * así toda 2ª+ factura de la semana queda como una fila extra colgada de esa
 * cuenta. Detecta la colisión DESPUÉS de tener todas las occurrences
 * consolidadas y los bounds de bucket — en los push sites aún no se sabe si
 * habrá colisión.
 *
 * El "primero" (que conserva su celda natural — la del contrato si engancha a
 * un item) se elige de forma determinista: primero las que enganchan a contrato
 * (con `itemId`) → scheduledDate asc → folio asc → dteId asc. Los demás del
 * grupo quedan marcados y obtienen sub-fila propia en `buildRows`.
 *
 * NO cambia montos: es sólo un flag de ruteo. El aporte al subtotal es idéntico
 * (misma occurrence, sólo cambia en qué sub-fila se agrupa su celda).
 */
export function markExtraInvoices(
  occurrences: VirtualOccurrence[],
  buckets: { key: string; start: Date; end: Date }[],
  folioByDteId?: Map<string, number | null>,
): void {
  const groups = new Map<string, VirtualOccurrence[]>();
  for (const o of occurrences) {
    if (o.kind !== "INCOME" || !o.dteId) continue;
    const d = utcCalendarDay(o.effectiveDate ?? o.scheduledDate);
    const b = buckets.find((bk) => d >= bk.start && d <= bk.end);
    if (!b) continue;
    const gk = `${o.crmAccountId ?? "_nocli"}::${o.installationId ?? "_noinst"}::${b.key}`;
    const arr = groups.get(gk) ?? [];
    arr.push(o);
    groups.set(gk, arr);
  }
  const folioOf = (dteId: string) => folioByDteId?.get(dteId) ?? Number.MAX_SAFE_INTEGER;
  for (const arr of groups.values()) {
    // Dedup defensivo por dteId (la consolidación ya deja uno por DTE).
    const byDte = new Map<string, VirtualOccurrence>();
    for (const o of arr) if (!byDte.has(o.dteId!)) byDte.set(o.dteId!, o);
    if (byDte.size < 2) continue;
    const sorted = [...byDte.values()].sort((a, b) => {
      // La que engancha a contrato (itemId) se queda como principal.
      const ai = a.itemId ? 0 : 1;
      const bi = b.itemId ? 0 : 1;
      if (ai !== bi) return ai - bi;
      const t = a.scheduledDate.getTime() - b.scheduledDate.getTime();
      if (t !== 0) return t;
      const fa = folioOf(a.dteId!);
      const fb = folioOf(b.dteId!);
      if (fa !== fb) return fa - fb;
      return a.dteId!.localeCompare(b.dteId!);
    });
    for (let i = 1; i < sorted.length; i++) sorted[i].isExtraInvoice = true;
  }
}

/**
 * Consolida los INGRESOS a UNA occurrence por facturación, según el modelo:
 * "el flujo muestra el DOCUMENTO (programación → borrador → factura), una sola
 * vez". Si un período ya tiene DTE (borrador/factura), ese DTE manda con su
 * monto real; la proyección estimada del contrato para ese mismo cobro se
 * descarta (no se duplica). Los períodos futuros sin DTE quedan como proyección
 * (Programada).
 *
 * Pasos:
 *  1. Una occurrence por `dteId`: el materializado y la "sombra $0" del MISMO
 *     DTE colapsan en una; la sombra se resuelve al BRUTO real del DTE.
 *  2. Las proyecciones puras (sin dteId) del mismo cliente+instalación se
 *     descartan solo si un DTE cae en el MISMO bucket semanal/mensual que la
 *     cuota programada (no ±20 días sueltos). Antes ±20d ocultaba la PROGRAMADA
 *     del día 20 en sem 25 si existía un borrador del 1–10 jun en otra semana.
 *
 * Egresos y demás (no INCOME) pasan sin tocar.
 */
function consolidateIncomeOccurrences(
  occs: VirtualOccurrence[],
  grossByDteId: Map<string, number>,
  granularity: ProjectionRange["granularity"],
  weekClosingDow?: number,
): VirtualOccurrence[] {
  const income = occs.filter((o) => o.kind === "INCOME");
  const other = occs.filter((o) => o.kind !== "INCOME");

  const byDte = new Map<string, VirtualOccurrence>();
  const projections: VirtualOccurrence[] = [];
  for (const o of income) {
    if (!o.dteId) {
      projections.push(o);
      continue;
    }
    const gross = grossByDteId.get(o.dteId) ?? 0;
    // Sombra $0 → bruto real del DTE; materializado → su propio monto.
    const amt = o.amountClp !== 0 ? o.amountClp : gross;
    const prev = byDte.get(o.dteId);
    if (!prev || Math.abs(amt) > Math.abs(prev.amountClp)) {
      byDte.set(o.dteId, { ...o, amountClp: amt, amountOriginal: amt });
    }
  }
  const dteOccs = [...byDte.values()];

  const dteBucketKeysByInstall = new Map<string, Set<string>>();
  for (const d of dteOccs) {
    const k = `${d.crmAccountId ?? ""}|${d.installationId ?? ""}`;
    const placement = d.effectiveDate ?? d.scheduledDate;
    const bKey = bucketKeyFor(placement, granularity, weekClosingDow);
    const set = dteBucketKeysByInstall.get(k) ?? new Set<string>();
    set.add(bKey);
    dteBucketKeysByInstall.set(k, set);
  }
  const keptProjections = projections.filter((p) => {
    const installKey = `${p.crmAccountId ?? ""}|${p.installationId ?? ""}`;
    const dteBuckets = dteBucketKeysByInstall.get(installKey);
    if (!dteBuckets || dteBuckets.size === 0) return true;
    const placement = p.effectiveDate ?? p.scheduledDate;
    const pBucket = bucketKeyFor(placement, granularity, weekClosingDow);
    return !dteBuckets.has(pBucket);
  });

  return [...other, ...dteOccs, ...keptProjections];
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

  // config, categories y la lista de items no dependen entre sí (cada uno
  // toma solo tenantId), así que se resuelven en paralelo en vez de tres
  // round-trips secuenciales. El orden de las derivaciones síncronas de más
  // abajo no cambia.
  const [config, categories, allItems] = await Promise.all([
    getOrCreateCashflowConfig(tenantId),
    listCategories(tenantId),
    // Excluimos source=PAYROLL (legacy pre-split): reemplazado por
    // PAYROLL_LIQUIDO + PAYROLL_PREVIRED. Los ítems source=CONTRACT son los
    // contratos CRM vigentes (Document → FinanceCashflowItem vía el tab
    // Contratos de cada cuenta) y deben incluirse en la proyección.
    listItems(tenantId, { isActive: true }),
  ]);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const codeToCategory = new Map<string, CategoryLite>(
    categories.map((c) => [c.code, c]),
  );
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

  // Espejo RECURRING_DTE sin plantilla o con plantilla inactiva: no debe
  // proyectarse (p. ej. plantilla borrada desde facturación sin apagar el ítem).
  const recurringTemplateIds = [
    ...new Set(
      itemsAfterOrphan
        .filter((i) => i.source === "RECURRING_DTE" && i.sourceRefId)
        .map((i) => i.sourceRefId as string),
    ),
  ];
  let itemsAfterRecurringSanity = itemsAfterOrphan;
  if (recurringTemplateIds.length > 0) {
    const tplActive = await prisma.financeDteRecurringTemplate.findMany({
      where: { tenantId, id: { in: recurringTemplateIds }, isActive: true },
      select: { id: true },
    });
    const activeTplIds = new Set(tplActive.map((t) => t.id));
    itemsAfterRecurringSanity = itemsAfterOrphan.filter((i) => {
      if (i.source !== "RECURRING_DTE" || !i.sourceRefId) return true;
      return activeTplIds.has(i.sourceRefId);
    });
  }

  // Programación recurrente (RECURRING_DTE) manda el placement; CONTRACT se
  // oculta cuando hay espejo recurrente para la misma cuenta+instalación.
  const items = filterCashflowItemsForProjection(itemsAfterRecurringSanity);
  // FinanceCashflowItem.installationId no tiene @relation, así que resolvemos
  // los nombres en un lookup batch por tenant. Pick mínimo para no traer overhead.
  // FinanceCashflowItem.installationId no tiene @relation, así que resolvemos
  // los nombres en un lookup batch por tenant. Pick mínimo para no traer overhead.
  const installationIds = Array.from(
    new Set(items.map((i) => i.installationId).filter((x): x is string => !!x)),
  );
  // Mapeo crmAccountId → name para agrupar en UI por cliente (Fase C.3).
  const crmAccountIds = Array.from(
    new Set(items.map((i) => i.crmAccountId).filter((x): x is string => !!x)),
  );
  // Estas cuatro lecturas solo dependen de ids derivados de `items` (no entre
  // sí), así que se resuelven en una sola ronda en vez de cuatro round-trips
  // secuenciales:
  //  - installations: nombres de instalación por id.
  //  - headcountRows: dotación planificada (SUM requiredGuards de puestos
  //    activos) por instalación — para "· N personas" en cada línea y el
  //    subtotal al colapsar el cliente.
  //  - crmAccounts: nombres de cuenta CRM.
  //  - materialized: occurrences ya materializadas en el rango.
  const [installations, headcountRows, crmAccounts, materialized] =
    await Promise.all([
      installationIds.length > 0
        ? prisma.crmInstallation.findMany({
            where: { tenantId, id: { in: installationIds } },
            select: { id: true, name: true },
          })
        : [],
      installationIds.length > 0
        ? prisma.opsPuestoOperativo.groupBy({
            by: ["installationId"],
            where: {
              tenantId,
              installationId: { in: installationIds },
              active: true,
            },
            _sum: { requiredGuards: true },
          })
        : [],
      crmAccountIds.length > 0
        ? prisma.crmAccount.findMany({
            where: { tenantId, id: { in: crmAccountIds } },
            select: { id: true, name: true },
          })
        : [],
      listMaterializedOccurrences(
        tenantId,
        range.from,
        range.to,
        items.map((i) => i.id),
      ),
    ]);
  const installationNameById = new Map(installations.map((i) => [i.id, i.name]));
  const headcountByInstallation = new Map<string, number>(
    headcountRows.map((r) => [r.installationId, r._sum.requiredGuards ?? 0]),
  );
  const crmAccountNameById = new Map(crmAccounts.map((a) => [a.id, a.name]));

  // ── Reajuste IPC esperado (items CLP con hasIpcAdjustment=true) ──
  // Pre-cargamos TODO el historial de ajustes APPLIED por item, ordenado
  // por fecha de vigencia (`dueDate`). Una cuota cae en el "tramo" del
  // ajuste cuyo dueDate <= cuotaDate < dueDate del siguiente — con eso
  // sabemos qué `newAmount` regía en esa fecha. Antes del primer ajuste,
  // regía el `oldAmount` del primero (= el monto contractual inicial).
  const ipcItemIds = items
    .filter((i) => i.hasIpcAdjustment && i.currency === "CLP")
    .map((i) => i.id);
  type IpcSegment = {
    dueDate: Date;
    oldAmount: number;
    newAmount: number;
  };
  const ipcSegmentsByItem = new Map<string, IpcSegment[]>();
  if (ipcItemIds.length > 0) {
    const allApplied = await prisma.financeContractIpcAdjustment.findMany({
      where: {
        tenantId,
        itemId: { in: ipcItemIds },
        status: "APPLIED",
        newAmount: { not: null },
        oldAmount: { not: null },
      },
      select: { itemId: true, dueDate: true, oldAmount: true, newAmount: true },
      orderBy: { dueDate: "asc" },
    });
    for (const a of allApplied) {
      if (a.newAmount == null || a.oldAmount == null) continue;
      const arr = ipcSegmentsByItem.get(a.itemId) ?? [];
      arr.push({
        dueDate: a.dueDate,
        oldAmount: Number(a.oldAmount),
        newAmount: Number(a.newAmount),
      });
      ipcSegmentsByItem.set(a.itemId, arr);
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
   * Calcula el monto NETO de una cuota CLP de un contrato con reajuste IPC,
   * respetando el historial real del contrato:
   *
   *   - Si la cuota cae ANTES del primer ajuste aplicado → `oldAmount` del
   *     primer ajuste (= monto contractual inicial).
   *   - Si la cuota cae ENTRE dos ajustes (o después del último) → el
   *     `newAmount` del ajuste cuya `dueDate` es la más reciente ≤ cuotaDate.
   *   - Si el item tiene `hasIpcAdjustment` pero todavía no hay APPLIED →
   *     se usa `baseAmount` (= `item.amount`).
   *
   * Sobre ese tramo histórico, si `ipcExpectedAnnualPct` está configurado,
   * proyectamos crecimiento compuesto a futuro por ciclos completos de
   * `ipcAdjustmentMonths` — útil para anticipar reajustes pendientes en
   * meses siguientes al último APPLIED.
   *
   * BUG previo (corregido): la versión anterior usaba siempre `newAmount`
   * del último APPLIED para CUALQUIER fecha, incluyendo cuotas anteriores
   * al reajuste — entonces un IPC aplicado en mayo "retro-pintaba" las
   * celdas de marzo y abril al nuevo monto, generando falsa varianza
   * contra los pagos bancarios reales del período pre-reajuste.
   */
  const projectIpcAdjustedAmount = (
    item: (typeof items)[number],
    cuotaDate: Date,
    baseAmount: number
  ): number => {
    if (!item.hasIpcAdjustment || item.currency !== "CLP") return baseAmount;
    const segments = ipcSegmentsByItem.get(item.id) ?? [];

    // Encontrar el tramo activo para `cuotaDate` (último ajuste con dueDate
    // ≤ cuotaDate). Si no encontramos ninguno y existen ajustes, la cuota
    // es anterior al primer reajuste — usamos `oldAmount` del primero.
    let activeSegmentIdx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].dueDate.getTime() <= cuotaDate.getTime()) {
        activeSegmentIdx = i;
      } else {
        break;
      }
    }
    let base: number;
    let baseDate: Date;
    if (activeSegmentIdx >= 0) {
      base = segments[activeSegmentIdx].newAmount;
      baseDate = segments[activeSegmentIdx].dueDate;
    } else if (segments.length > 0) {
      base = segments[0].oldAmount;
      baseDate = item.startDate;
    } else {
      base = baseAmount;
      baseDate = item.startDate;
    }

    // Proyección futura por IPC esperado: sólo aplica si la cuota está
    // adelante del tramo activo y hay tasa anual configurada.
    // Fase 4: desactivada — el reajuste futuro se gestiona en Programación.
    if (!PROJECT_IPC_FORWARD) return base;
    if (!ipcAnnualPct || ipcAnnualPct <= 0) return base;
    const cycleMonths = Number(item.ipcAdjustmentMonths ?? 12);
    if (cycleMonths <= 0) return base;
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
    const virtualDates = expandRecurrence(
      itemForRecurrenceExpansion(item),
      range.from,
      range.to,
    );
    const itemMats = matsByItem.get(item.id) ?? [];

    // Cada slot representa una cuota a renderizar: combina una fecha
    // efectiva (la de la materialized si existe, si no la virtual) con la
    // materialized asociada (override de monto, status, etc).
    type Slot = { d: Date; mat: typeof materialized[number] | null };
    const slots: Slot[] = virtualDates.map((d) => ({ d, mat: null }));
    const claimedSlotIdx = new Set<number>();
    const claimedMatIds = new Set<string>();

    // Pasada 0 — items ONCE: match 1-a-1 por itemId (independiente de fecha).
    // Una cuota ONCE tiene exactamente 1 slot virtual (en startDate) y a lo
    // sumo 1 occurrence materializada. Si la mat fue movida, su fecha ya no
    // coincide con el slot virtual, y las pasadas por fecha/bucket dejarían
    // el slot virtual sin reclamar (fantasma id=null) + la mat como slot
    // extra. Acá el match es trivial: el slot único reclama la mat única.
    if (item.recurrence === "ONCE" && slots.length > 0 && itemMats.length > 0) {
      const m = itemMats[0];
      slots[0] = { d: m.scheduledDate, mat: m };
      claimedSlotIdx.add(0);
      claimedMatIds.add(m.id);
    }

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

    // Pasada 2 — match por BUCKET (mes/semana/trimestre/año) según la
    // recurrencia del item. Reemplaza el match por delta-días previo,
    // que dejaba slots virtuales fantasma cuando el usuario movía una
    // cuota >tolerance días del dayOfMonth configurado (ej: Berlintex
    // sem 21 → sem 23 con dayOfMonth=4 quedaba doble).
    //
    // Usa occurrenceBucketKey del helper compartido (bucket-matcher.ts).
    // Antes había una copia local de la lógica acá; ahora es la misma
    // función que usa draft-occurrence-matcher para evitar drift entre
    // matchers.
    const recurrence = item.recurrence as string;
    for (const m of itemMats) {
      if (claimedMatIds.has(m.id)) continue;
      const matBucket = occurrenceBucketKey(m.scheduledDate, recurrence);
      const idx = slots.findIndex(
        (s, i) =>
          !claimedSlotIdx.has(i) &&
          occurrenceBucketKey(s.d, recurrence) === matBucket,
      );
      if (idx !== -1) {
        slots[idx] = { d: m.scheduledDate, mat: m };
        claimedSlotIdx.add(idx);
        claimedMatIds.add(m.id);
      } else {
        // Materialized fuera de cualquier bucket virtual (caso raro:
        // cuota movida a un mes donde el item no tenía proyección
        // recurrente, ej fuera del rango startDate-endDate). La
        // incluimos como slot extra para no perderla.
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
        notes: mat?.notes ?? null,
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
        nickname: item.nickname ?? null,
        modoCobro:
          (item.modoCobro as "DIRECTO" | "FACTORING" | undefined) ?? "DIRECTO",
        hasAmountOverride: hasManualOverride,
        // Item MANUAL/EXPENSE creado desde una conciliación bancaria (glosa del
        // banco como nombre, sin cliente/instalación): la grilla lo colapsa en
        // su cuenta. Un gasto manual aún no conciliado (sin bank-tx) no entra.
        isConciliacion: isBankBornManualExpense(item, mat?.bankTransactionId ?? null),
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
        where: {
          tenantId,
          id: { in: dteIdsToResolve },
          // Skip NC/ND (56/61): el matcher de bank-links engancha DTEs
          // con allocations bancarias a Occurrences proyectadas del
          // contrato del mismo cliente. Las NCs y ND no son ingresos
          // del contrato — son créditos/débitos al cliente. Si las
          // dejáramos pasar, la celda del contrato mostraría la NC
          // como "Factura N° X Pagada" (caso real: NC 147 sobre
          // factura 1633 de Embajada Brasil).
          //
          // El filtro acá las excluye del map dteToCrmAccount; el guard
          // existente más abajo (`if (!crmAccountId) continue;`) las
          // skipa naturalmente sin requerir cambios en el loop.
          //
          // No hay backfill necesario: este matching es runtime y se
          // re-ejecuta en cada carga del flujo. El fix aplica al
          // siguiente deploy.
          dteType: { notIn: [56, 61] },
          // Anuladas/rechazadas no representan flujo real. Mismo criterio que
          // `orphanDtes` — el matcher las dejaba pasar y terminaban marcando
          // como PAID una cuota del contrato con plata de una factura
          // inexistente (rama if(best)) o pusheando una occurrence sintética
          // PAID (rama else). Ambas inflan actualIncome / saldo acumulado.
          siiStatus: { notIn: ["ANNULLED", "REJECTED"] },
          // Anulada TOTAL por NC (CodRef=1): sale del flujo. La NC parcial
          // (CodRef=3, creditedNetAmount > 0) NO se excluye acá — permanece
          // con monto ajustado vía computeCreditNoteImpact(), igual que en
          // orphanDtes.
          voidedByCreditNoteId: null,
        },
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
        const eligibleItems =
          filteredItems.length > 0 ? filteredItems : itemCandidates;
        const itemIds = eligibleItems.map((it) => it.id);

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
        } else {
          // Sin occurrence PROJECTED disponible (caso típico: dos DTEs del
          // mismo cliente/instalación cayendo en la misma semana — el primer
          // DTE consumió la única cuota proyectada y el segundo se queda sin
          // par). Para que el segundo DTE aparezca también en la celda del
          // contrato (y "Igualar a factura" pueda sumar AMBAS facturas),
          // generamos una occurrence sintética PAID anclada al mismo item:
          // amountClp=0 para no inflar la proyección, actualAmountClp=monto
          // banco real → solo suma a "actual" del bucket y a cell.dtes[].
          const chosenItem = eligibleItems[0];
          const cat = categoryMap.get(chosenItem.categoryId);
          allOccurrences.push({
            id: null,
            itemId: chosenItem.id,
            source: chosenItem.source,
            categoryId: chosenItem.categoryId,
            categoryCode: cat?.code ?? "UNKNOWN",
            categoryName: cat?.name ?? "Sin categoría",
            kind: chosenItem.kind,
            name: chosenItem.name,
            description: chosenItem.description,
            notes: null,
            scheduledDate: firstTx.date,
            effectiveDate: firstTx.date,
            amountClp: 0,
            amountOriginal: 0,
            currency: "CLP",
            ufValueUsed: null,
            status: "PAID",
            installationId: chosenItem.installationId,
            installationName: chosenItem.installationId
              ? (installationNameById.get(chosenItem.installationId) ?? null)
              : null,
            crmAccountId: chosenItem.crmAccountId ?? null,
            bankTransactionId: firstTx.id,
            isVirtual: true,
            isAutoGenerated: true,
            actualAmountClp: agg.totalAmount,
            varianceClp: agg.totalAmount,
            hasIpcAdjustment: false,
            ipcAdjustmentMonths: null,
            dteId: agg.dteId,
            nickname: chosenItem.nickname ?? null,
            modoCobro:
              (chosenItem.modoCobro as "DIRECTO" | "FACTORING" | undefined) ??
              "DIRECTO",
          });
          for (const tx of agg.bankTxs) consumedBankTxIds.add(tx.id);
        }
      }
    }
  }

  // ── DTEs HUÉRFANOS (sin occurrence vinculada) ──
  // Reglas (acordadas con el usuario):
  //   • Todo DTE (borrador o emitido) cuyo `date` cae en el horizonte y NO
  //     está ya enganchado a una occurrence de contrato debe APARECER en
  //     el flujo de caja como fila propia con su badge identificativo.
  //   • El auto-bind a contrato (matchDraftToOccurrence) solo opera sobre
  //     proyecciones del MISMO MES posteriores al DTE; cualquier DTE fuera
  //     de esa ventana (atrasado vs cuota, mes sin proyección, sin contrato)
  //     queda huérfano y se renderiza aquí.
  //   • El usuario maneja la dedupe a mano: si quiere evitar doble conteo,
  //     borra/desactiva la proyección de contrato — es preferible al
  //     auto-dedup agresivo que ocultaba facturas sin avisar.
  //
  // Implementación: emitimos VirtualOccurrence sintéticas (itemId=null,
  // dteId seteado, status derivado del SII/payment status). Caen en su
  // propia "fila DTE" agrupada bajo el cliente CRM correspondiente, con
  // badge (DRAFT/INVOICED/CEDED/PAID) según el estado actual del DTE.
  //
  // Categoría preferida: la misma que el ítem CONTRACT activo del mismo
  // crmAccount/installation — así la factura aparece bajo el mismo header
  // "Cliente X" que su contrato dentro de "Ventas por contrato", en lugar
  // de quedar separada bajo "Otros ingresos". El usuario ve clarito qué
  // proyección le duplica con qué factura emitida y puede decidir cuál
  // borrar. Fallback ING_OTRO/EGR_OTRO solo para DTEs sin contrato
  // (one-offs, clientes nuevos, recibidas sin proveedor proyectado).
  const fallbackIncomeCat = codeToCategory.get("ING_OTRO");
  const fallbackExpenseCat = codeToCategory.get("EGR_OTRO");
  const contractCategoryByCrmAccount = new Map<string, string>();
  const contractCategoryByInstallation = new Map<string, string>();
  // Maps al ITEM completo (no solo categoría). Sirven para enganchar
  // DTEs huérfanos al item del contrato y evitar que aparezcan como
  // filas propias debajo del cliente. Sin esto, cada factura/borrador
  // huérfano genera una sub-fila más bajo el cliente, sumando al
  // "$/mes" del header. Con esto, se mete dentro de la celda del
  // contrato vía cell.dtes[].
  type ContractItem = (typeof items)[number];
  // Multi-item por instalación/cuenta: una instalación puede tener cobro
  // partido en varios items (ej. Transmat 80% / 20%). Guardamos la LISTA y
  // elegimos por monto al enganchar el DTE (abajo). Incluye RECURRING_DTE
  // además de CONTRACT: las facturas de plantilla recurrente (ej. Pine) también
  // son programación soberana y deben enganchar a su item, no quedar huérfanas
  // mostrándose como "Programada" mientras la factura ya existe.
  const contractItemsByCrmAccount = new Map<string, ContractItem[]>();
  const contractItemsByInstallation = new Map<string, ContractItem[]>();
  for (const it of items) {
    if (it.source !== "CONTRACT" && it.source !== "RECURRING_DTE") continue;
    // Categoría preferida: solo desde CONTRACT (comportamiento previo).
    if (it.source === "CONTRACT") {
      if (it.crmAccountId && !contractCategoryByCrmAccount.has(it.crmAccountId)) {
        contractCategoryByCrmAccount.set(it.crmAccountId, it.categoryId);
      }
      if (it.installationId && !contractCategoryByInstallation.has(it.installationId)) {
        contractCategoryByInstallation.set(it.installationId, it.categoryId);
      }
    }
    if (it.crmAccountId) {
      const arr = contractItemsByCrmAccount.get(it.crmAccountId) ?? [];
      arr.push(it);
      contractItemsByCrmAccount.set(it.crmAccountId, arr);
    }
    if (it.installationId) {
      const arr = contractItemsByInstallation.get(it.installationId) ?? [];
      arr.push(it);
      contractItemsByInstallation.set(it.installationId, arr);
    }
  }
  // Entre varias programaciones de la misma instalación/cuenta, elige la que
  // mejor calza por MONTO con el DTE (UF→CLP al valor de la fecha del DTE).
  // Sin esto, con cobro partido (Transmat 80% / 20%) la factura caía en la
  // cuota equivocada (80↔20 cruzados).
  async function pickProgramacionByAmount(
    candidates: ContractItem[] | undefined,
    grossClp: number,
    atDate: Date,
  ): Promise<ContractItem | undefined> {
    if (!candidates || candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];
    let best = candidates[0];
    let bestDiff = Infinity;
    for (const it of candidates) {
      const clp =
        it.currency === "UF"
          ? Number(it.amount) *
            (await resolveUfForOccurrence(it.ufFixingPolicy, it.ufFixingDay, atDate))
          : Number(it.amount);
      const diff = Math.abs(clp - grossClp);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = it;
      }
    }
    return best;
  }
  const linkedDteIds = new Set(
    allOccurrences.map((o) => o.dteId).filter((x): x is string => !!x),
  );
  const orphanDtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      date: { gte: range.from, lte: range.to },
      // Excluimos anuladas y rechazadas — no representan flujo real.
      siiStatus: { notIn: ["ANNULLED", "REJECTED"] },
      // Excluimos NC/ND (56/61): ajustan al DTE original, no son flujo
      // independiente (mismo criterio que dte-issuer al llamar al matcher).
      dteType: { notIn: [56, 61] },
      // Excluir SOLO facturas anuladas TOTAL (NC CodRef=1): salen del flujo
      // porque ya no representan ningún ingreso/egreso.
      // Las facturas con NC PARCIAL (CodRef=3, creditedNetAmount > 0) SÍ
      // permanecen en el flujo con monto ajustado — se calcula post-fetch
      // con computeCreditNoteImpact() y se descartan solo si el bruto
      // remanente queda en 0 (NC parcial que cubre el total).
      // Estado de resultados / libro IVA usan la fórmula F29 del
      // sales-aggregator (bruto + ND − NC) independientemente.
      voidedByCreditNoteId: null,
      id: linkedDteIds.size > 0 ? { notIn: Array.from(linkedDteIds) } : undefined,
    },
    select: {
      id: true,
      direction: true,
      date: true,
      totalAmount: true,
      netAmount: true,
      creditedNetAmount: true,
      amountPaid: true,
      folio: true,
      siiStatus: true,
      paymentStatus: true,
      dueDate: true,
      crmAccountId: true,
      installationId: true,
      receiverName: true,
      issuerName: true,
      receiverRut: true, // ← NUEVO: para resolver cliente por RUT
    },
  });
  const orphanDteIds = orphanDtes.map((d) => d.id);
  const dteDateOverrideByIdEarly = await loadDteDateOverrides(tenantId, orphanDteIds);

  // Backfill de cliente CRM por RUT para DTEs huérfanos cuyo crmAccountId viene null.
  // Mismo patrón que el matcher DTE-issuer (más arriba). Permite que Path 1 enganche
  // la factura a la línea del cliente aunque el DTE no traiga crmAccountId explícito.
  const orphanRutsNeedingLookup = orphanDtes
    .filter((d) => !d.crmAccountId && d.receiverRut && d.direction === "ISSUED")
    .map((d) => d.receiverRut!)
    .filter((r, i, arr) => arr.indexOf(r) === i);
  const orphanCrmByRut = new Map<string, string>();
  if (orphanRutsNeedingLookup.length > 0) {
    const accs = await prisma.crmAccount.findMany({
      where: { tenantId, rut: { in: orphanRutsNeedingLookup } },
      select: { id: true, rut: true },
    });
    for (const a of accs) if (a.rut) orphanCrmByRut.set(a.rut, a.id);
  }

  for (const dte of orphanDtes) {
    const isIncome = dte.direction === "ISSUED";

    // Calcular el impacto de NC parciales (CodRef=3) sobre este DTE.
    // Cuando creditedNetAmount > 0, descontamos el bruto proporcional
    // (prorrateado con el ratio total/net del DTE) para reflejar el
    // saldo real que va a entrar a caja. Si la NC parcial cubre el
    // 100% del bruto (caso raro: equivale a anulación vía CodRef=3),
    // skipeamos el DTE — no aporta flujo.
    const ncImpact = computeCreditNoteImpact({
      totalAmount: Number(dte.totalAmount),
      netAmount: Number(dte.netAmount),
      creditedNetAmount: Number(dte.creditedNetAmount),
    });
    if (ncImpact.isFullyCredited) continue;

    // Facturas de proveedor (DTEs recibidos) NO entran al flujo de caja
    // por su mera recepción. Solo aparecen cuando hay un bank-link real
    // (DTE_RECEIVED) — en ese caso entran por el loop de bank-links
    // huérfanos más abajo con status=PAID y amountClp=monto banco real.
    if (!isIncome) continue;

    // Path 1 (NUEVO): si es INCOME y existe item de contrato del mismo
    // cliente/instalación, ENGANCHAR al item (no crear fila propia).
    // El DTE se va a renderizar dentro de la celda del contrato como
    // parte de cell.dtes[] gracias al matching itemId existente en el
    // render (línea ~1620-1636).
    //
    // Prioridad: installationId exacto > crmAccountId (cualquier inst).
    // Cuando hay match, hacemos `continue` para no caer al path
    // fallback de fila propia.
    if (isIncome) {
      // Match estricto: si el DTE tiene instalación, SOLO engancha a items de
      // esa instalación. Sin fallback a crmAccount, que en cuentas con varias
      // instalaciones (ej. Polpaico) enganchaba todos los DTEs al primer item
      // (Coronel) → factura de El Bosque aparecía como Coronel duplicado. Si no
      // hay item de esa instalación, cae al Path 2 (fila propia del DTE).
      // Entre los items de esa instalación/cuenta, se elige por monto: corrige
      // el cruce 80↔20 cuando la instalación tiene cobro partido (Transmat).
      // Fallback a crmAccount: si el DTE trae installationId pero NINGÚN item
      // la tiene (ej. Pine: la factura tiene instalación pero el item de
      // contrato quedó solo con crmAccount), enganchamos por cuenta en vez de
      // dejar la factura huérfana mostrándose como "Programada". La
      // desambiguación por monto evita cruces entre instalaciones de la cuenta.
      // crmAccountId efectivo: directo del DTE, o resuelto por RUT (backfill).
      const resolvedCrmAccountId =
        dte.crmAccountId ??
        (dte.receiverRut ? (orphanCrmByRut.get(dte.receiverRut) ?? null) : null);

      let candidateItems = dte.installationId
        ? contractItemsByInstallation.get(dte.installationId)
        : undefined;
      if ((!candidateItems || candidateItems.length === 0) && resolvedCrmAccountId) {
        candidateItems = contractItemsByCrmAccount.get(resolvedCrmAccountId);
      }
      const contractItem = await pickProgramacionByAmount(
        candidateItems,
        ncImpact.grossPostNc,
        dte.date,
      );
      if (contractItem) {
        const paidInner = Number(dte.amountPaid);
        // Status derivado: PAID si paymentStatus es PAID, sino PROJECTED
        // (incluye DRAFT, INVOICED, OVERDUE — el badge de la celda se
        // calcula con deriveCellStatus a partir del DTE).
        const innerStatus =
          dte.paymentStatus === "PAID"
            ? ("PAID" as const)
            : ("PROJECTED" as const);
        const cat = categoryMap.get(contractItem.categoryId);
        const p1OverrideDate = dteDateOverrideByIdEarly.get(dte.id);
        const p1EffectiveDteDate = p1OverrideDate
          ? new Date(p1OverrideDate + "T00:00:00")
          : dte.date;
        allOccurrences.push({
          id: null,
          itemId: contractItem.id,           // ← clave: engancha al item
          source: contractItem.source,
          categoryId: contractItem.categoryId,
          categoryCode: cat?.code ?? "UNKNOWN",
          categoryName: cat?.name ?? "Sin categoría",
          kind: contractItem.kind,
          name: contractItem.name,           // ← nombre del item, no del DTE
          description: null,
          notes: null,
          scheduledDate: p1EffectiveDteDate,
          effectiveDate: dte.paymentStatus === "PAID" ? p1EffectiveDteDate : null,
          // amountClp=0 para NO inflar la proyección (el item ya proyecta
          // sus propias Occurrences). actualAmountClp solo si está PAID.
          amountClp: 0,
          amountOriginal: 0,
          currency: "CLP",
          ufValueUsed: null,
          status: innerStatus,
          installationId: contractItem.installationId,
          installationName: contractItem.installationId
            ? (installationNameById.get(contractItem.installationId) ?? null)
            : null,
          crmAccountId: contractItem.crmAccountId,
          bankTransactionId: null,
          isVirtual: true,
          isAutoGenerated: true,
          actualAmountClp: dte.paymentStatus === "PAID" ? paidInner : null,
          varianceClp: null,
          hasIpcAdjustment: false,
          ipcAdjustmentMonths: null,
          dteId: dte.id,                     // ← cell.dtes[] lo va a listar
          nickname: contractItem.nickname ?? null,
          modoCobro:
            (contractItem.modoCobro as
              | "DIRECTO"
              | "FACTORING"
              | undefined) ?? "DIRECTO",
        });
        continue;                            // ← skip fallback
      }
    }

    // Path 2 (legacy): no hay item de contrato del cliente. Cae a la
    // categoría fallback ING_OTRO/EGR_OTRO y crea fila propia
    // (itemId=null). Caso legítimo: factura suelta sin contrato.
    let cat = isIncome ? fallbackIncomeCat : fallbackExpenseCat;
    if (!cat) continue; // tenant sin las categorías fallback configuradas
    // grossPostNc descuenta NCs parciales del totalAmount nominal. Sin
    // NC parcial es igual a totalAmount; con NC parcial proyecta solo
    // el saldo remanente que va a entrar a caja.
    const gross = ncImpact.grossPostNc;
    const paid = Number(dte.amountPaid);
    const status =
      dte.paymentStatus === "PAID"
        ? ("PAID" as const)
        : ("PROJECTED" as const);
    const p2OverrideDate = dteDateOverrideByIdEarly.get(dte.id);
    const p2EffectiveDteDate = p2OverrideDate
      ? new Date(p2OverrideDate + "T00:00:00")
      : dte.date;
    allOccurrences.push({
      id: null,
      itemId: null,
      source: "MANUAL",
      categoryId: cat.id,
      categoryCode: cat.code,
      categoryName: cat.name,
      kind: cat.kind,
      name: dte.folio
        ? `${isIncome ? "Factura" : "Recibida"} #${dte.folio} · ${isIncome ? dte.receiverName : dte.issuerName}`
        : `Borrador · ${isIncome ? dte.receiverName : dte.issuerName}`,
      description: null,
      notes: null,
      scheduledDate: p2EffectiveDteDate,
      effectiveDate: p2EffectiveDteDate,
      amountClp: gross,
      amountOriginal: gross,
      currency: "CLP",
      ufValueUsed: null,
      status,
      installationId: dte.installationId,
      installationName: dte.installationId
        ? (installationNameById.get(dte.installationId) ?? null)
        : null,
      // Cliente CRM efectivo: directo o resuelto por RUT. Habilita agrupar la
      // fila huérfana bajo el nombre del cliente en buildRows (crmAccountName).
      crmAccountId:
        dte.crmAccountId ??
        (dte.receiverRut ? (orphanCrmByRut.get(dte.receiverRut) ?? null) : null),
      bankTransactionId: null,
      isVirtual: true,
      isAutoGenerated: true,
      // actualAmountClp solo si está cobrada — para que el badge PAID
      // sume al "actual" del bucket sin tocar el proyectado.
      actualAmountClp: dte.paymentStatus === "PAID" ? paid : null,
      varianceClp: null,
      hasIpcAdjustment: false,
      ipcAdjustmentMonths: null,
      dteId: dte.id,
      // DTE huérfano sin item de contrato → no hay nickname ni modo de
      // cobro asociado; default DIRECTO para no inventar factoring.
      nickname: null,
      modoCobro: "DIRECTO",
    });
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
      notes: null,
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
      // Bank-link sintético sin contrato → DIRECTO por default.
      nickname: null,
      modoCobro: "DIRECTO",
      // Conciliación pura (bank-link huérfano). Solo EGRESOS se colapsan por
      // cuenta; un INGRESO conciliado sin contrato es una venta real que el
      // usuario necesita ver por cliente, así que conserva su fila propia.
      isConciliacion: cat.kind === "EXPENSE",
    });
  }

  // Enriquecer cada occurrence con el nombre de la cuenta CRM (cliente). El map
  // crmAccountNameById ya se cargó arriba a partir de los items. Esto habilita
  // que la UI muestre "Cuenta – Instalación" y ordene por cliente sin tener que
  // setear el campo en cada uno de los ~5 push sites (incl. DTEs huérfanos).
  for (const occ of allOccurrences) {
    occ.crmAccountName = occ.crmAccountId
      ? (crmAccountNameById.get(occ.crmAccountId) ?? null)
      : null;
  }

  // ── Consolidación de ingresos: una occurrence por facturación ──
  // Carga el bruto real de cada DTE referenciado y colapsa los ingresos para
  // que cada cobro aparezca UNA vez (DTE si existe → monto real + etapa; si no,
  // la proyección). A partir de acá el pipeline (buckets, sumas, rows) opera
  // sobre el set consolidado, no sobre allOccurrences.
  const incomeDteIds = Array.from(
    new Set(allOccurrences.map((o) => o.dteId).filter((x): x is string => !!x)),
  );
  const grossByDteId = new Map<string, number>();
  if (incomeDteIds.length > 0) {
    const dtesForGross = await prisma.financeDte.findMany({
      where: { tenantId, id: { in: incomeDteIds } },
      select: { id: true, totalAmount: true, netAmount: true, creditedNetAmount: true },
    });
    for (const d of dtesForGross) {
      grossByDteId.set(
        d.id,
        computeCreditNoteImpact({
          totalAmount: Number(d.totalAmount),
          netAmount: Number(d.netAmount),
          creditedNetAmount: Number(d.creditedNetAmount),
        }).grossPostNc,
      );
    }
  }
  // Mismo criterio de bucket que placement (ISO semanal). weekClosingDow del
  // config aplica al cierre manual, no aún a buildBuckets/ placement.
  const occurrences = consolidateIncomeOccurrences(
    allOccurrences,
    grossByDteId,
    range.granularity,
    undefined,
  );

  const buckets = buildBuckets(range);
  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));

  // Pre-cálculo: occurrences proyectadas ocultas porque conviven con una
  // conciliada en la misma celda (categoryId, bucketKey). Sin esto los
  // totales del bucket quedan inconsistentes con las celdas visuales.
  const hiddenOccurrenceIds = new Set<VirtualOccurrence>();
  {
    const groupedByCellKey = new Map<string, VirtualOccurrence[]>();
    for (const occ of occurrences) {
      const placementDate = occ.effectiveDate ?? occ.scheduledDate;
      const bKey = bucketKeyFor(placementDate, range.granularity);
      const cellKey = `${occ.categoryId}::${bKey}`;
      const arr = groupedByCellKey.get(cellKey) ?? [];
      arr.push(occ);
      groupedByCellKey.set(cellKey, arr);
    }
    for (const [, occs] of groupedByCellKey) {
      const visible = filterOccurrencesWithConciliationPriority(occs);
      if (visible.length === occs.length) continue;
      const visibleSet = new Set(visible);
      for (const occ of occs) {
        if (!visibleSet.has(occ)) hiddenOccurrenceIds.add(occ);
      }
    }
  }

  for (const occ of occurrences) {
    // Usamos effectiveDate cuando existe — refleja la fecha REAL en que la
    // cuota se ejecutó (rebalanceada al conciliar), no la fecha programada
    // original. Esto hace que la matriz "siga al banco" cuando hay atrasos.
    const placementDate = occ.effectiveDate ?? occ.scheduledDate;
    const key = bucketKeyFor(placementDate, range.granularity);
    const idx = bucketIndex.get(key);
    if (idx === undefined) continue;
    const b = buckets[idx];

    // Si esta occurrence quedó "oculta" por la regla de conciliación
    // (hay una conciliada en su celda), no suma al bucket.
    if (hiddenOccurrenceIds.has(occ)) {
      b.occurrences.push(occ);
      continue;
    }

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
      occurrences
        .map((o) => o.dteId)
        .filter((x): x is string => !!x),
    ),
  );
  const dteStatusById = new Map<string, DteStatusSlim>();
  const dteFolioById = new Map<string, number | null>();
  const dteGrossById = new Map<string, number>();
  const dteIssueDateById = new Map<string, string>();
  const dteDueDateById = new Map<string, string | null>();
  const dteReconciledAtById = new Map<string, string | null>();
  const dtePaymentStatusById = new Map<string, string>();
  const dteAmountPaidById = new Map<string, number>();
  const dteAmountPendingById = new Map<string, number>();
  const dteVoidedByCreditNoteById = new Map<string, string | null>();
  const dteVoidedAtById = new Map<string, string | null>();
  const dteCreditedNetAmountById = new Map<string, number>();
  const activeFactoringDteIds = new Set<string>();
  /** Subconjunto de activeFactoringDteIds cuya cesión ya fue girada/cobrada
   *  (FactoringOperation en FUNDED/COLLECTED): la plata entró al banco. */
  const collectedFactoringDteIds = new Set<string>();
  /** Suma del write-off (totalDebit) por DTE. Positivo = SHORT (pérdida),
   *  negativo = OVER (ganancia). Cargado del FinanceJournalEntry con
   *  sourceType=RECONCILIATION y sourceId=dteId. */
  const writeOffByDteId = new Map<string, number>();
  if (dteIds.length > 0) {
    const [dtes, factoringOps, writeOffEntries] = await Promise.all([
      prisma.financeDte.findMany({
        where: { tenantId, id: { in: dteIds } },
        select: {
          id: true,
          siiStatus: true,
          paymentStatus: true,
          dueDate: true,
          date: true,
          folio: true,
          dteType: true,
          totalAmount: true,
          netAmount: true,
          creditedNetAmount: true,
          voidedByCreditNoteId: true,
          voidedAt: true,
          amountPaid: true,
          amountPending: true,
          reconciledAt: true,
        },
      }),
      prisma.financeFactoringOperation.findMany({
        where: {
          tenantId,
          dteId: { in: dteIds },
          status: { in: ["APPROVED", "FUNDED", "COLLECTED"] },
        },
        select: { dteId: true, status: true },
      }),
      prisma.financeJournalEntry.findMany({
        where: {
          tenantId,
          sourceType: "RECONCILIATION",
          sourceId: { in: dteIds },
          status: "POSTED",
        },
        select: {
          sourceId: true,
          totalDebit: true,
          description: true,
        },
      }),
    ]);
    for (const d of dtes) {
      dteStatusById.set(d.id, {
        id: d.id,
        siiStatus: d.siiStatus,
        paymentStatus: d.paymentStatus,
        dueDate: d.dueDate,
        voidedByCreditNoteId: d.voidedByCreditNoteId,
        creditedNetAmount: Number(d.creditedNetAmount),
      });
      dteFolioById.set(d.id, d.folio ?? null);
      const grossPostNc = computeCreditNoteImpact({
        totalAmount: Number(d.totalAmount),
        netAmount: Number(d.netAmount),
        creditedNetAmount: Number(d.creditedNetAmount),
      }).grossPostNc;
      dteGrossById.set(d.id, grossPostNc);
      dteIssueDateById.set(d.id, d.date.toISOString().slice(0, 10));
      dteDueDateById.set(d.id, d.dueDate ? d.dueDate.toISOString().slice(0, 10) : null);
      dteReconciledAtById.set(d.id, d.reconciledAt ? d.reconciledAt.toISOString() : null);
      dtePaymentStatusById.set(d.id, d.paymentStatus);
      dteAmountPaidById.set(d.id, Number(d.amountPaid));
      dteAmountPendingById.set(d.id, Number(d.amountPending));
      dteVoidedByCreditNoteById.set(d.id, d.voidedByCreditNoteId);
      dteVoidedAtById.set(d.id, d.voidedAt ? d.voidedAt.toISOString() : null);
      dteCreditedNetAmountById.set(d.id, Number(d.creditedNetAmount));
    }
    for (const f of factoringOps) {
      if (!f.dteId) continue;
      activeFactoringDteIds.add(f.dteId);
      // FUNDED/COLLECTED = el depósito del cesionario ya entró/se concilió.
      // APPROVED = cedida pero aún esperando el giro → sigue "Factorizada".
      if (f.status === "FUNDED" || f.status === "COLLECTED") {
        collectedFactoringDteIds.add(f.dteId);
      }
    }
    for (const e of writeOffEntries) {
      if (!e.sourceId) continue;
      const amount = Number(e.totalDebit);
      // El signo (SHORT vs OVER) se infiere del descripción del asiento:
      // si contiene "excedente" es OVER (negativo, ganancia); en otro
      // caso asumimos SHORT (positivo, pérdida). Es heurística — el
      // dato semántico vive en el detalle del asiento.
      const isOver = (e.description ?? "").toLowerCase().includes("excedente");
      const signed = isOver ? -amount : amount;
      writeOffByDteId.set(
        e.sourceId,
        (writeOffByDteId.get(e.sourceId) ?? 0) + signed,
      );
    }
  }
  const dteDateOverrideByIdLater = await loadDteDateOverrides(
    tenantId,
    dteIds.filter((id) => !dteDateOverrideByIdEarly.has(id)),
  );
  const dteDateOverrideById = new Map([
    ...dteDateOverrideByIdEarly,
    ...dteDateOverrideByIdLater,
  ]);

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

  // Detección de facturas extra (2ª+ DTE del mismo contrato en el mismo
  // bucket): se resuelve acá, con occurrences consolidadas y buckets/folios
  // ya disponibles, y NO en los push sites (ahí aún no se conoce la colisión).
  markExtraInvoices(occurrences, buckets, dteFolioById);

  const rows = buildRows(
    buckets,
    categories,
    occurrences,
    crmAccountNameById,
    cellStatusByDteId,
    dteStatusById,
    headcountByInstallation,
    dteFolioById,
    dteGrossById,
    dteIssueDateById,
    activeFactoringDteIds,
    collectedFactoringDteIds,
    writeOffByDteId,
    dteDueDateById,
    dteReconciledAtById,
    dtePaymentStatusById,
    dteAmountPaidById,
    dteAmountPendingById,
    dteVoidedByCreditNoteById,
    dteVoidedAtById,
    dteCreditedNetAmountById,
    dteDateOverrideById,
  );

  // ── Etapa del ciclo por CELDA (item+bucket), stampada en las occurrences ──
  // Si CUALQUIER occurrence de una celda tiene DTE (incl. la sombra $0 que
  // carga el folio), reflejamos esa etapa (Borrador/Facturada/Factorizada/
  // Pagada) en TODAS las occurrences de la celda. Así la fila del flujo muestra
  // la etapa real aunque la occurrence visible sea la proyección del contrato
  // (sin dteId) y el DTE viva en una occurrence hermana. Sin esto el flujo
  // mostraba todo como "Programada".
  const STAGE_RANK: Record<string, number> = {
    PROJECTED: 0, DRAFT: 1, INVOICED: 2, CEDED: 3, PAID: 4, VOIDED: 5,
  };
  const cellStageByKey = new Map<
    string,
    { status: CashflowCellStatus; folio: number | null; daysOverdue: number; dteId: string; factoringCollected: boolean }
  >();
  const cellKeyOf = (o: VirtualOccurrence) =>
    `${o.itemId ?? `dte:${o.dteId}`}::${bucketKeyFor(o.effectiveDate ?? o.scheduledDate, range.granularity)}`;
  for (const o of occurrences) {
    if (!o.dteId) continue;
    const cs = cellStatusByDteId.get(o.dteId);
    if (!cs) continue;
    const key = cellKeyOf(o);
    const prev = cellStageByKey.get(key);
    if (!prev || (STAGE_RANK[cs.status] ?? 0) >= (STAGE_RANK[prev.status] ?? 0)) {
      cellStageByKey.set(key, {
        status: cs.status,
        folio: dteFolioById.get(o.dteId) ?? null,
        daysOverdue: cs.daysOverdue,
        dteId: o.dteId,
        factoringCollected: collectedFactoringDteIds.has(o.dteId),
      });
    }
  }
  for (const o of occurrences) {
    if (o.dteId) {
      // Tiene DTE propio → lleva SU estado/folio (no el de un hermano de la
      // celda; si no, dos facturas de la misma instalación se pisarían el folio).
      const cs = cellStatusByDteId.get(o.dteId);
      if (cs) {
        o.cellStatus = cs.status;
        o.daysOverdue = cs.daysOverdue;
      }
      o.dteFolio = dteFolioById.get(o.dteId) ?? null;
      o.factoringCollected = collectedFactoringDteIds.has(o.dteId);
      continue;
    }
    // Proyección pura → toma el estado del DTE de su celda (si lo hay).
    const cell = cellStageByKey.get(cellKeyOf(o));
    if (!cell) continue;
    o.cellStatus = cell.status;
    o.dteFolio = cell.folio;
    o.daysOverdue = cell.daysOverdue;
    o.dteId = cell.dteId; // habilita el deep-link del folio en la fila
    o.factoringCollected = cell.factoringCollected;
  }

  const openingBreakdown = await resolveOpeningBalance(tenantId);
  const opening = openingBreakdown.totalClp;

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  // ── ANCHOR DEL CIERRE SEMANAL ─────────────────────────────────────
  // Si existe un cierre con isAnchor=true, la proyección hacia adelante
  // parte de ahí, no de `opening`. Los buckets pre-anchor muestran saldo
  // banco real histórico (auditoría visual). Sin anchor, comportamiento
  // idéntico al previo.
  const anchorClose = await prisma.financeCashflowWeeklyClose.findFirst({
    where: { tenantId, isAnchor: true },
    orderBy: { weekEndDate: "desc" },
    select: {
      weekEndDate: true,
      bankBalanceClp: true,
      isManual: true,
      forcedBalanceClp: true,
      manualReason: true,
    },
  });
  // Para cierres manuales la base de la proyección es el saldo forzado, no el
  // banco calculado — así la apertura de las semanas siguientes parte del valor
  // que el usuario selló con motivo.
  const anchorBalance = anchorClose
    ? Number(
        anchorClose.isManual && anchorClose.forcedBalanceClp != null
          ? anchorClose.forcedBalanceClp
          : anchorClose.bankBalanceClp,
      )
    : null;
  const anchorDate = anchorClose?.weekEndDate ?? null;

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

  // Si hay anchor, el runningProjected arranca diferente:
  //  - buckets con end <= anchorDate → mostramos saldo banco real al b.end
  //                                    (ya disponible via getRealBankBalanceAt)
  //  - primer bucket con start > anchorDate → runningProjected = anchorBalance + b.net
  //  - buckets siguientes → runningProjected += b.net
  // Sin anchor: igual que antes (runningProjected = opening; runningProjected += b.net).
  let runningProjected = anchorBalance ?? opening;
  let crossedAnchor = anchorDate === null; // sin anchor, ya estamos "post-anchor" desde el bucket 0
  let lastRealBucketIdx = -1;
  const cumulativePoints: CumulativeBalancePoint[] = buckets.map((b, idx) => {
    const isPastOrCurrent = b.start.getTime() <= todayMidnight.getTime();
    const cutoff =
      b.end.getTime() <= todayMidnight.getTime() ? b.end : todayMidnight;

    // Caso A: bucket totalmente pre-anchor (end <= anchorDate)
    if (anchorDate !== null && b.end.getTime() <= anchorDate.getTime()) {
      const realBank = getRealBankBalanceAt(
        cutoff,
        accountIds,
        snapshotsByAccount,
        txsByAccount,
      );
      if (realBank !== null) runningProjected = realBank;
      lastRealBucketIdx = idx;
      return {
        bucketKey: b.key,
        projectedClp: realBank ?? runningProjected,
        realBankClp: realBank,
        cumulativeBankVarianceClp: 0,
      };
    }

    // Caso B: bucket que cruza el anchor (start <= anchorDate < end) o primer post-anchor
    if (!crossedAnchor && anchorDate !== null && b.start.getTime() <= anchorDate.getTime()) {
      runningProjected = (anchorBalance as number) + b.net;
      crossedAnchor = true;
    } else if (!crossedAnchor && anchorDate !== null && b.start.getTime() > anchorDate.getTime()) {
      runningProjected = (anchorBalance as number) + b.net;
      crossedAnchor = true;
    } else {
      // Buckets siguientes (post-anchor) o sin anchor en absoluto
      runningProjected += b.net;
    }

    if (!isPastOrCurrent) {
      return {
        bucketKey: b.key,
        projectedClp: runningProjected,
        realBankClp: null,
        cumulativeBankVarianceClp: null,
      };
    }

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
    anchor: anchorClose
      ? {
          weekEndDate: anchorClose.weekEndDate.toISOString(),
          bankBalanceClp: anchorBalance ?? Number(anchorClose.bankBalanceClp),
          isManual: anchorClose.isManual,
          manualReason: anchorClose.manualReason,
        }
      : null,
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

/**
 * Filtro por celda: cuando hay al menos una occurrence conciliada
 * (bankTransactionId !== null), se descartan todas las proyectadas.
 * Las conciliaciones múltiples se suman entre sí.
 */
/**
 * "La programación manda, el DTE le pinta el estado": dentro de un conjunto de
 * occurrences del MISMO bucket, si un itemId ya tiene una occurrence con DTE
 * real, se descartan las proyecciones puras (dteId=null) de ESE itemId. Mata
 * la sombra (doble conteo + colisión al mover). Las occurrences sin itemId
 * (huérfanas verdaderas) no se tocan acá.
 */
function filterShadowProjectionsWithDtePriority(
  occurrences: VirtualOccurrence[],
): VirtualOccurrence[] {
  if (occurrences.length === 0) return occurrences;
  const itemIdsWithDte = new Set<string>();
  for (const o of occurrences) {
    if (o.itemId && o.dteId) itemIdsWithDte.add(o.itemId);
  }
  if (itemIdsWithDte.size === 0) return occurrences;
  return occurrences.filter(
    (o) => !(o.itemId && !o.dteId && itemIdsWithDte.has(o.itemId)),
  );
}

/**
 * Clave de "movimiento" para acotar la regla de conciliación en INGRESOS.
 * Una conciliación solo reemplaza la proyección del MISMO movimiento
 * (item de contrato / factura DTE / cuenta+instalación), no la de otros
 * clientes. Sin identidad resoluble devuelve `null` → la occurrence nunca
 * oculta ni es ocultada por otras.
 */
function incomeMovementKey(o: VirtualOccurrence): string | null {
  if (o.itemId) return `item:${o.itemId}`;
  if (o.dteId) return `dte:${o.dteId}`;
  if (o.crmAccountId || o.installationId) {
    return `acct:${o.crmAccountId ?? ""}|${o.installationId ?? ""}`;
  }
  return null;
}

export function filterOccurrencesWithConciliationPriority(
  occurrences: VirtualOccurrence[],
): VirtualOccurrence[] {
  if (occurrences.length === 0) return occurrences;
  // 1) La programación manda: ocultar proyección-sombra cuando su celda tiene DTE.
  const afterShadow = filterShadowProjectionsWithDtePriority(occurrences);
  // 2) Conciliación bancaria reemplaza lo proyectado (regla más fuerte).
  const hasConciliation = afterShadow.some((o) => o.bankTransactionId !== null);
  if (!hasConciliation) return afterShadow;

  // En EGRESOS mantenemos el comportamiento amplio (la conciliación de la
  // celda categoría+bucket reemplaza toda proyección: los gastos se ven
  // colapsados por categoría y una conciliación real manda sobre el estimado).
  const allIncome = afterShadow.every((o) => o.kind === "INCOME");
  if (!allIncome) {
    return afterShadow.filter((o) => o.bankTransactionId !== null);
  }

  // En INGRESOS acotamos la regla: la conciliación solo reemplaza la
  // PROYECCIÓN-sombra (dteId=null) del MISMO movimiento. Antes la regla amplia
  // borraba de la grilla y de los subtotales toda proyección de la categoría+
  // semana, así una factura cobrada ocultaba las facturas impagas de OTROS
  // clientes ("no salen todas las facturas de DTE emitidos"). Reglas:
  //   • Una occurrence conciliada (bankTransactionId) siempre se muestra.
  //   • Una factura real (dteId) SIEMPRE se muestra: es un documento distinto,
  //     nunca la oculta la conciliación de un hermano.
  //   • Una proyección pura (dteId=null) se oculta solo si su MISMO movimiento
  //     (item / cuenta+instalación) tiene una conciliada.
  const reconciledKeys = new Set<string>();
  for (const o of afterShadow) {
    if (o.bankTransactionId === null) continue;
    const k = incomeMovementKey(o);
    if (k) reconciledKeys.add(k);
  }
  if (reconciledKeys.size === 0) return afterShadow;
  return afterShadow.filter((o) => {
    if (o.bankTransactionId !== null) return true;
    if (o.dteId) return true;
    const k = incomeMovementKey(o);
    return k === null || !reconciledKeys.has(k);
  });
}

/**
 * Sources que generan 1 item por período (mes/quincena/año) — su monto
 * varía por bucket porque depende de un cálculo periódico (% de ventas
 * netas del mes, F29 del período, etc.). En la UI los queremos colapsados
 * en una sola sub-fila por categoría con valores por bucket, en vez de
 * una sub-fila por cada período.
 *
 * Ejemplo: `RETIRO_SOCIO` produce items "Retiro socios 2026-04",
 * "Retiro socios 2026-05", … "Retiro socios 2027-03". Sin agrupamiento,
 * la categoría "Retiros socios / dividendos" muestra 12+ sub-filas
 * verticales con montos en distintos buckets. Con agrupamiento, una
 * sola sub-fila "Retiro socios" con los montos repartidos por bucket.
 *
 * Solo aplican sources cuyos items SON intercambiables a nivel UI
 * (mismo cálculo, mismo significado, distinto período). NO agregar acá
 * sources donde cada item representa una entidad distinta (CONTRACT
 * por instalación, PAYROLL_LIQUIDO por puesto, etc.).
 */
const PERIODIC_AGGREGATE_SOURCES = new Set<string>([
  "RETIRO_SOCIO",
  "IVA",
]);

/**
 * Nombre visible para la sub-fila agregada por source periódico.
 * Reemplaza el `itemName` original ("Retiro socios 2026-04", "IVA F29
 * 2026-05", etc.) por una etiqueta estable independiente del período.
 */
const PERIODIC_DISPLAY_NAMES: Record<string, string> = {
  RETIRO_SOCIO: "Retiro socios",
  IVA: "IVA F29",
};

function buildRows(
  buckets: ProjectionBucket[],
  categories: FinanceCashflowCategory[],
  occs: VirtualOccurrence[],
  crmAccountNameById: Map<string, string>,
  cellStatusByDteId: Map<
    string,
    { status: CashflowCellStatus; daysOverdue: number; dteId: string | null }
  >,
  dteStatusById: Map<string, DteStatusSlim>,
  headcountByInstallation: Map<string, number>,
  dteFolioById: Map<string, number | null>,
  dteGrossById: Map<string, number>,
  dteIssueDateById: Map<string, string>,
  activeFactoringDteIds: Set<string>,
  collectedFactoringDteIds: Set<string>,
  writeOffByDteId: Map<string, number>,
  dteDueDateById: Map<string, string | null>,
  dteReconciledAtById: Map<string, string | null>,
  dtePaymentStatusById: Map<string, string>,
  dteAmountPaidById: Map<string, number>,
  dteAmountPendingById: Map<string, number>,
  dteVoidedByCreditNoteById: Map<string, string | null>,
  dteVoidedAtById: Map<string, string | null>,
  dteCreditedNetAmountById: Map<string, number>,
  dteDateOverrideById: Map<string, string>,
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
      const inBucket = filtered.filter((o) => {
        // utcCalendarDay: alinea con bucketBoundsFor (que normaliza a día UTC),
        // para que la membresía no dependa del timezone del servidor.
        const d = utcCalendarDay(o.effectiveDate ?? o.scheduledDate);
        return d >= b.start && d <= b.end;
      });
      const visible = filterOccurrencesWithConciliationPriority(inBucket);
      const amount = visible.reduce((s, o) => {
        const isReconciled = o.bankTransactionId !== null;
        const displayAmount = isReconciled
          ? (o.actualAmountClp ?? o.amountClp)
          : o.amountClp;
        return s + displayAmount;
      }, 0);
      return { bucketKey: b.key, amount };
    });

    // Pre-cálculo: para cada bucket, qué occurrences son visibles según la
    // regla "conciliación reemplaza proyección".
    const visibleByBucket = new Map<string, Set<VirtualOccurrence>>();
    for (const b of buckets) {
      const inBucket = filtered.filter((o) => {
        // utcCalendarDay: alinea con bucketBoundsFor (que normaliza a día UTC),
        // para que la membresía no dependa del timezone del servidor.
        const d = utcCalendarDay(o.effectiveDate ?? o.scheduledDate);
        return d >= b.start && d <= b.end;
      });
      const visible = filterOccurrencesWithConciliationPriority(inBucket);
      visibleByBucket.set(b.key, new Set(visible));
    }

    // Desglose por item — una sub-fila por (itemId | _dte:<id> | _orphan).
    // Los DTE huérfanos (itemId=null, dteId seteado) reciben sub-fila propia
    // para que cada factura/borrador aparezca como su propia línea con badge;
    // sin esto colapsarían bajo "_orphan" junto a bank-links sintéticos.
    const byItem = new Map<string, import("./types").ProjectionRowItemDetail>();
    for (const o of filtered) {
      // Agrupamiento de items periódicos (1 item por mes con monto variable
      // por período → 1 sub-fila visual con valores por bucket). Para esos
      // sources, todas las occurrences caen en la misma entrada del map.
      const isPeriodicGroup =
        !!o.itemId && PERIODIC_AGGREGATE_SOURCES.has(o.source);
      // Movimiento de conciliación pura (bank-link huérfano o item MANUAL
      // nacido de banco): una sub-fila por movimiento (keyed por bank-tx) para
      // que la grilla de EGRESOS los pueda colapsar por cuenta con el desglose
      // completo al expandir. Sin esto, los huérfanos de una misma categoría
      // colapsaban bajo "_orphan" perdiendo el detalle por movimiento.
      const isConciliacionMove = !!o.isConciliacion && !!o.bankTransactionId;
      // 2ª+ factura del mismo contrato en el bucket: sub-fila propia
      // (`_extra:<dteId>`) para que sea visible con badge en vez de colapsar en
      // la celda del contrato (donde sólo vivía en el popover). Su aporte al
      // subtotal es idéntico al que tenía colapsada: sólo cambia la sub-fila.
      const isExtra = !!o.isExtraInvoice && !!o.dteId;
      const key = isPeriodicGroup
        ? `_periodic:${o.source}`
        : isConciliacionMove
          ? `_conc:${o.bankTransactionId}`
          : isExtra
            ? `_extra:${o.dteId}`
            : (o.itemId ?? (o.dteId ? `_dte:${o.dteId}` : "_orphan"));

      // Fila de factura DTE: huérfana (_dte:) o extra (_extra:). Va SIEMPRE
      // anclada a una cuenta: si el DTE resuelve cliente → su nombre; si no,
      // al grupo "Sin cliente" (nunca "suelta" como "Factura #N · receptor").
      const isDteRow = key.startsWith("_dte:") || isExtra;
      const resolvedAccountName = o.crmAccountId
        ? (crmAccountNameById.get(o.crmAccountId) ?? null)
        : null;
      const dteRowAccountName = isDteRow
        ? (resolvedAccountName ?? "Sin cliente")
        : resolvedAccountName;
      let detail = byItem.get(key);
      if (!detail) {
        detail = {
          itemId: key,
          itemName: isPeriodicGroup
            ? (PERIODIC_DISPLAY_NAMES[o.source] ?? o.name)
            : // Fila de factura (_dte:/_extra:) → nombre del cliente (o "Sin
              // cliente"), para agruparla bajo su encabezado en vez de
              // "Factura #N · receptor".
              isDteRow
              ? (dteRowAccountName ?? o.name)
              : o.name,
          installationId: isPeriodicGroup ? null : o.installationId,
          installationName: isPeriodicGroup ? null : o.installationName,
          crmAccountId: isPeriodicGroup ? null : o.crmAccountId,
          crmAccountName: isPeriodicGroup ? null : dteRowAccountName,
          // baseAmount no aplica al agregado periódico — distintos meses
          // tienen distintos montos. Lo dejamos en 0 para que la UI no
          // muestre un "$/mes" engañoso al lado del nombre.
          baseAmount: isPeriodicGroup || isExtra ? 0 : (o.amountOriginal ?? o.amountClp),
          currency: o.currency,
          source: o.source,
          sourceRefCode: null,
          hasIpcAdjustment: isPeriodicGroup ? false : o.hasIpcAdjustment,
          ipcAdjustmentMonths: isPeriodicGroup ? null : o.ipcAdjustmentMonths,
          headcount:
            !isPeriodicGroup && o.installationId
              ? (headcountByInstallation.get(o.installationId) ?? 0)
              : 0,
          nickname: isPeriodicGroup ? null : (o.nickname ?? null),
          modoCobro: o.modoCobro ?? "DIRECTO",
          isConciliacion: isConciliacionMove,
          isExtraInvoice: isExtra,
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
            reconciled: false,
            dtes: [] as import("./types").CellDteSummary[],
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

      // Regla "conciliación reemplaza proyección": si esta occurrence cae
      // en un bucket donde hay alguna conciliada y ella misma es proyectada,
      // se omite — la conciliación es soberana.
      const visibleSet = visibleByBucket.get(buckets[bIdx].key);
      if (visibleSet && !visibleSet.has(o)) continue;

      let amountForBucket: number;
      const isReconciled = o.bankTransactionId !== null;
      if (isReconciled) {
        amountForBucket = o.actualAmountClp ?? o.amountClp;
      } else {
        amountForBucket = o.amountClp;
        if (o.dteId) {
          const dteInfo = dteStatusById.get(o.dteId);
          const dteGross = dteGrossById.get(o.dteId);
          if (
            dteInfo?.siiStatus === "DRAFT" &&
            dteGross !== undefined &&
            Math.abs(dteGross - o.amountClp) > 1
          ) {
            amountForBucket = dteGross;
          }
        }
      }
      detail.values[bIdx].amount += amountForBucket;
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
      if (o.hasAmountOverride) {
        detail.values[bIdx].hasAmountOverride = true;
      }
      // Conciliada (bank-matched) ⇒ celda fija. Vale para gastos conciliados
      // SIN factura (dteId=null), que antes quedaban fijos pero sin candado.
      if (isReconciled) {
        detail.values[bIdx].reconciled = true;
      }
      detail.total += amountForBucket;
      // cellStatus: si la occurrence tiene DTE vinculado, derivamos el estado
      // y lo mergeamos con el actual de la celda. Precedencia: PAID > CEDED >
      // DRAFT > INVOICED > PROJECTED. Mostramos el "más informativo" si caen
      // varias cuotas en la misma celda.
      if (o.dteId) {
        const derived = cellStatusByDteId.get(o.dteId);
        if (derived) {
          const cell = detail.values[bIdx];
          const current = cell.cellStatus ?? "PROJECTED";
          // Override de cellStatus a PAID: solo aplicamos cuando la
          // occurrence está PAID + bank-matched Y el DTE en BD reporta
          // PAID o PARTIAL. Antes este override disparaba también
          // para DTEs UNPAID/OVERDUE — eso era un bug (factura 1701):
          // ocurrencias stale con bankTransactionId obsoleto fingían
          // PAID en la matriz aunque el DTE NO estuviera cobrado.
          //
          // Si el DTE está UNPAID/OVERDUE, confiamos en el DTE como
          // fuente de verdad y mostramos INVOICED/OVERDUE.
          const dtePaymentStatus = dteStatusById.get(o.dteId)?.paymentStatus;
          const dteIsCollected =
            dtePaymentStatus === "PAID" || dtePaymentStatus === "PARTIAL";
          const isOccurrencePaid =
            o.status === "PAID" &&
            o.bankTransactionId !== null &&
            dteIsCollected;
          const effectiveStatus: CashflowCellStatus = isOccurrencePaid
            ? "PAID"
            : derived.status;
          const effectiveDaysOverdue = isOccurrencePaid
            ? 0
            : derived.daysOverdue;
          if (CELL_STATUS_RANK[effectiveStatus] > CELL_STATUS_RANK[current]) {
            cell.cellStatus = effectiveStatus;
            cell.dteId = derived.dteId;
            cell.dteFolio = derived.dteId
              ? (dteFolioById.get(derived.dteId) ?? null)
              : null;
            cell.dteGrossAmount = derived.dteId
              ? (dteGrossById.get(derived.dteId) ?? null)
              : null;
            cell.daysOverdue = effectiveDaysOverdue;
          } else if (
            effectiveStatus === "INVOICED" &&
            current === "INVOICED" &&
            (effectiveDaysOverdue ?? 0) > (cell.daysOverdue ?? 0)
          ) {
            cell.daysOverdue = effectiveDaysOverdue;
          }
          // Acumular el DTE en el array de facturas conciliadas (dedup por id).
          // El item del array refleja el estado real de ESTA occurrence (no el
          // del DTE global) — si está PAID con banco, el popover lo lista como
          // pagada, aunque el DTE en BD siga en PARTIAL por varianza.
          const dtes = cell.dtes ?? [];
          if (!dtes.some((d) => d.id === o.dteId)) {
            const issueDateStr = dteIssueDateById.get(o.dteId) ?? "";
            const overrideDateStr = dteDateOverrideById.get(o.dteId);
            dtes.push({
              id: o.dteId,
              folio: dteFolioById.get(o.dteId) ?? null,
              totalAmount: dteGrossById.get(o.dteId) ?? 0,
              issueDate: issueDateStr,
              dueDate: dteDueDateById.get(o.dteId) ?? null,
              reconciledAt: dteReconciledAtById.get(o.dteId) ?? null,
              paymentStatus: dtePaymentStatusById.get(o.dteId) ?? "UNPAID",
              amountPaid: dteAmountPaidById.get(o.dteId) ?? 0,
              amountPending: dteAmountPendingById.get(o.dteId) ?? 0,
              hasFactoring: activeFactoringDteIds.has(o.dteId),
              factoringCollected: collectedFactoringDteIds.has(o.dteId),
              voidedByCreditNoteId: dteVoidedByCreditNoteById.get(o.dteId) ?? null,
              voidedAt: dteVoidedAtById.get(o.dteId) ?? null,
              creditedNetAmount: dteCreditedNetAmountById.get(o.dteId) ?? 0,
              cellStatus: effectiveStatus,
              daysOverdue: effectiveDaysOverdue,
              hasDateOverride: !!overrideDateStr && overrideDateStr !== issueDateStr,
              originalDate: issueDateStr,
            });
            cell.dtes = dtes;
          }
          // Si el DTE tuvo un write-off (auto o manual), exponemos el monto
          // para que la celda muestre el badge "Δ". Suma del totalDebit de
          // todos los asientos RECONCILIATION asociados al DTE — típicamente
          // hay uno solo, pero si hubo varias conciliaciones acumulamos.
          const wo = writeOffByDteId.get(o.dteId);
          if (wo !== undefined && wo !== 0) {
            cell.writeOffAmount = (cell.writeOffAmount ?? 0) + wo;
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

