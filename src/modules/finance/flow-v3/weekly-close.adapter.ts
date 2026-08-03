import "server-only";
import { prisma } from "@/lib/prisma";
import {
  persistWeeklyClose,
  reopenWeeklyClose,
} from "@/modules/finance/cashflow/weekly-close.service";
import { weekStartForClosing, weekEndForClosing } from "@/modules/finance/cashflow/recurrence-engine";
import {
  startOfIsoWeekUTC,
  toYmd,
  v2WeekEndDate,
  v2WeekEndYmd,
  weekLabel,
  ymdToDate,
} from "./weeks";

/**
 * Puente entre el cierre semanal v3 y el servicio v2 (weekly-close.service.ts),
 * que se REUTILIZA sin modificar su lógica de persistencia.
 *
 * Snapshot lite: el diálogo aporta el proyectado desde la matriz (`getProjected`).
 * `getV3WeeklyCloseSnapshotLite` resuelve en paralelo banco + contadores +
 * alreadyClosed, sin `buildProjection` (costo dominante del servicio v2).
 */

export async function closingDow(tenantId: string): Promise<number> {
  const cfg = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: { weekClosingDow: true },
  });
  return cfg?.weekClosingDow ?? 5;
}

export interface V3WeeklyCloseSnapshot {
  /** Lunes ISO de la semana v3 que se cierra. */
  weekStartYmd: string;
  /** Domingo ISO (fin de la semana v3). */
  weekEndYmd: string;
  weekLabel: string;
  /** Saldo banco sugerido. */
  bankBalanceClp: number;
  /**
   * Proyectado del motor v2. En la vía lite queda en 0: el diálogo prefiere
   * `getProjected` de la matriz. Se mantiene el campo por compatibilidad de shape.
   */
  projectedBalanceClp: number;
  /** `bank − projected`. En lite: 0 (el cliente calcula con el proyectado de matriz). */
  varianceClp: number;
  unassignedBankCount: number;
  unfulfilledProjCount: number;
  alreadyClosed: boolean;
  isFuture: boolean;
  /** Normalización reportable: día de cierre v2 subyacente (YMD). */
  v2WeekEndYmd: string;
}

/** Resuelve la semana v3 a partir de cualquier día que caiga en ella. */
function resolveWeek(anyDayYmd: string): { monday: string; sunday: string } {
  const d = ymdToDate(anyDayYmd);
  if (!d) throw new Error("Fecha inválida");
  const mondayDate = startOfIsoWeekUTC(d);
  const monday = toYmd(mondayDate);
  const sunday = toYmd(new Date(mondayDate.getTime() + 6 * 86_400_000));
  return { monday, sunday };
}

async function isWeekClosed(tenantId: string, mondayYmd: string, dow: number): Promise<boolean> {
  const targetYmd = v2WeekEndYmd(mondayYmd, dow);
  const target = ymdToDate(targetYmd)!;
  const close = await prisma.financeCashflowWeeklyClose.findFirst({
    where: {
      tenantId,
      weekEndDate: { gte: target, lt: new Date(target.getTime() + 86_400_000) },
    },
    select: { id: true },
  });
  return !!close;
}

/**
 * Saldo banco consolidado a una fecha (misma lógica que el helper privado del
 * servicio v2). Copiado aquí para no tocar weekly-close.service.ts.
 */
async function bankBalanceAsOf(tenantId: string, asOf: Date): Promise<number> {
  const accounts = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true, currency: "CLP" },
    select: { id: true, currentBalance: true },
  });
  let total = 0;
  for (const acc of accounts) {
    const snap = await prisma.financeBankAccountBalance.findFirst({
      where: { tenantId, bankAccountId: acc.id, asOfDate: { lte: asOf } },
      orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
      select: { balance: true },
    });
    total += snap ? Number(snap.balance) : Number(acc.currentBalance ?? 0);
  }
  return total;
}

/**
 * Snapshot rápido para el diálogo v3: sin `buildProjection`, contadores con
 * `.count`, queries en paralelo. `projectedBalanceClp`/`varianceClp` = 0
 * (el cliente usa la matriz).
 */
export async function getV3WeeklyCloseSnapshotLite(
  tenantId: string,
  anyDayYmd: string,
): Promise<V3WeeklyCloseSnapshot> {
  const { monday, sunday } = resolveWeek(anyDayYmd);
  const dow = await closingDow(tenantId);
  const weekEnd = v2WeekEndDate(monday, dow);
  const weekEndNorm = weekEndForClosing(weekEnd, dow);
  const weekStart = weekStartForClosing(weekEnd, dow);
  const currentMonday = toYmd(startOfIsoWeekUTC(new Date()));

  const [bankBalanceClp, unassignedBankCount, unfulfilledProjCount, alreadyClosed] =
    await Promise.all([
      bankBalanceAsOf(tenantId, weekEndNorm),
      prisma.financeBankTransaction.count({
        where: {
          tenantId,
          hiddenAt: null,
          transactionDate: { gte: weekStart, lte: weekEndNorm },
          links: { none: {} },
        },
      }),
      prisma.financeCashflowOccurrence.count({
        where: {
          tenantId,
          status: "PROJECTED",
          bankTransactionId: null,
          scheduledDate: { gte: weekStart, lte: weekEndNorm },
        },
      }),
      isWeekClosed(tenantId, monday, dow),
    ]);

  return {
    weekStartYmd: monday,
    weekEndYmd: sunday,
    weekLabel: weekLabel(monday),
    bankBalanceClp: Math.round(bankBalanceClp),
    projectedBalanceClp: 0,
    varianceClp: 0,
    unassignedBankCount,
    unfulfilledProjCount,
    alreadyClosed,
    isFuture: monday > currentMonday,
    v2WeekEndYmd: v2WeekEndYmd(monday, dow),
  };
}

/** Alias de la vía lite (la ruta snapshot v3 siempre usa lite). */
export const getV3WeeklyCloseSnapshot = getV3WeeklyCloseSnapshotLite;

export interface PersistV3CloseInput {
  anyDayYmd: string;
  /** Saldo de cierre confirmado por el usuario (sugerido = banco). */
  closedBalance: number;
  notes?: string;
  /** Obligatorio si closedBalance difiere del saldo banco sugerido. */
  manualReason?: string;
}

/**
 * Persiste el cierre de la semana v3. Si el saldo confirmado difiere del banco
 * sugerido → cierre MANUAL (manualReason obligatorio, genera la occurrence de
 * ajuste v2 — invisible en v3). El saldo sellado (`bankBalanceClp`) ancla la
 * cadena de Saldo acumulado en la matriz v3 (ver matrix-assemble).
 */
export async function persistV3WeeklyClose(
  tenantId: string,
  userId: string | null,
  input: PersistV3CloseInput,
): Promise<{ weekStartYmd: string; weekEndYmd: string; isManual: boolean }> {
  const { monday, sunday } = resolveWeek(input.anyDayYmd);
  const dow = await closingDow(tenantId);
  const currentMonday = toYmd(startOfIsoWeekUTC(new Date()));
  if (monday > currentMonday) throw new Error("No se puede cerrar una semana futura");
  if (await isWeekClosed(tenantId, monday, dow)) {
    throw new Error("La semana ya está cerrada");
  }

  const weekEnd = v2WeekEndDate(monday, dow);
  const weekEndNorm = weekEndForClosing(weekEnd, dow);
  const bankBalanceClp = await bankBalanceAsOf(tenantId, weekEndNorm);
  const isManual = Math.abs(input.closedBalance - bankBalanceClp) > 1;
  if (isManual && (!input.manualReason || input.manualReason.trim().length < 5)) {
    throw new Error("manualReason requerido (mínimo 5 caracteres) para un saldo distinto del banco");
  }

  await persistWeeklyClose(tenantId, userId, {
    weekEnd,
    notes: input.notes,
    anchor: false,
    mode: isManual ? "manual" : "real",
    ...(isManual
      ? { forcedBalanceClp: input.closedBalance, manualReason: input.manualReason }
      : {}),
  });

  return { weekStartYmd: monday, weekEndYmd: sunday, isManual };
}

/** Reabre el cierre de la semana v3 que contiene `anyDayYmd`. */
export async function reopenV3WeeklyClose(
  tenantId: string,
  anyDayYmd: string,
): Promise<{ weekStartYmd: string }> {
  const { monday } = resolveWeek(anyDayYmd);
  const dow = await closingDow(tenantId);
  await reopenWeeklyClose(tenantId, v2WeekEndDate(monday, dow));
  return { weekStartYmd: monday };
}

/** De una lista de lunes ISO, cuáles están selladas (para marcar el header). */
export async function listClosedV3Weeks(
  tenantId: string,
  mondayYmds: string[],
): Promise<string[]> {
  if (mondayYmds.length === 0) return [];
  const dow = await closingDow(tenantId);
  const mapped = mondayYmds.map((m) => ({ monday: m, endYmd: v2WeekEndYmd(m, dow) }));
  const ends = mapped.map((x) => ymdToDate(x.endYmd)!);
  const min = new Date(Math.min(...ends.map((d) => d.getTime())));
  const max = new Date(Math.max(...ends.map((d) => d.getTime())));
  const closes = await prisma.financeCashflowWeeklyClose.findMany({
    where: { tenantId, weekEndDate: { gte: min, lte: new Date(max.getTime() + 86_400_000) } },
    select: { weekEndDate: true },
  });
  const closedEndYmds = new Set(closes.map((c) => c.weekEndDate.toISOString().slice(0, 10)));
  return mapped.filter((x) => closedEndYmds.has(x.endYmd)).map((x) => x.monday);
}

/**
 * Carga sellos de cierre (`bankBalanceClp`) cuyo weekEndDate v2 cae en el
 * rango de semanas ISO (+ el último sello previo al rango).
 */
export async function loadSealedBalancesForMatrix(
  tenantId: string,
  mondayYmds: string[],
): Promise<{
  sealedBalances: Map<string, number>;
  priorSealed: { mondayYmd: string; balance: number } | null;
}> {
  const sealedBalances = new Map<string, number>();
  let priorSealed: { mondayYmd: string; balance: number } | null = null;
  if (mondayYmds.length === 0) return { sealedBalances, priorSealed };

  const dow = await closingDow(tenantId);
  const mapped = mondayYmds.map((m) => ({ monday: m, endYmd: v2WeekEndYmd(m, dow) }));
  const ends = mapped.map((x) => ymdToDate(x.endYmd)!);
  const min = new Date(Math.min(...ends.map((d) => d.getTime())));
  const max = new Date(Math.max(...ends.map((d) => d.getTime())));

  const sealSelect = {
    weekEndDate: true,
    bankBalanceClp: true,
    isManual: true,
    forcedBalanceClp: true,
  } as const;
  const resolvedSeal = (c: {
    bankBalanceClp: { toString(): string } | number;
    isManual: boolean;
    forcedBalanceClp: { toString(): string } | number | null;
  }) =>
    Math.round(
      Number(
        c.isManual && c.forcedBalanceClp != null ? c.forcedBalanceClp : c.bankBalanceClp,
      ),
    );

  const [inRange, prior] = await Promise.all([
    prisma.financeCashflowWeeklyClose.findMany({
      where: {
        tenantId,
        weekEndDate: { gte: min, lte: new Date(max.getTime() + 86_400_000) },
      },
      select: sealSelect,
    }),
    prisma.financeCashflowWeeklyClose.findFirst({
      where: { tenantId, weekEndDate: { lt: min } },
      orderBy: { weekEndDate: "desc" },
      select: sealSelect,
    }),
  ]);

  const byEndYmd = new Map<string, number>();
  for (const c of inRange) {
    byEndYmd.set(c.weekEndDate.toISOString().slice(0, 10), resolvedSeal(c));
  }
  for (const m of mapped) {
    const bal = byEndYmd.get(m.endYmd);
    if (bal != null) sealedBalances.set(m.monday, bal);
  }

  if (prior) {
    const priorEndYmd = prior.weekEndDate.toISOString().slice(0, 10);
    const priorMonday = toYmd(startOfIsoWeekUTC(ymdToDate(priorEndYmd)!));
    priorSealed = { mondayYmd: priorMonday, balance: resolvedSeal(prior) };
  }

  return { sealedBalances, priorSealed };
}

/** Rechaza (en servidor) escrituras de plan sobre semanas selladas. */
export async function assertV3WeeksWritable(
  tenantId: string,
  mondayYmds: string[],
): Promise<void> {
  const sealed = await listClosedV3Weeks(tenantId, mondayYmds);
  if (sealed.length > 0) {
    throw new Error("Semana cerrada: reábrela para editar su plan");
  }
}
