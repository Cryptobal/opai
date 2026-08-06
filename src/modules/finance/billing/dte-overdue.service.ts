/**
 * Marcado diario UNPAID → OVERDUE de facturas emitidas (cron).
 *
 * `paymentStatus` es un solo enum, así que "vencida" es un estado y no un flag:
 * una factura sin pagos pasa a OVERDUE cuando su `dueDate` quedó atrás. Antes
 * de este cron el único camino a OVERDUE era `recomputeDtePaymentAggregate`
 * (que corre solo al conciliar/desconciliar), así que una factura que nadie
 * tocaba nunca se marcaba vencida.
 *
 * Corte de día: `America/Santiago`. Una factura con `dueDate` = hoy NO está
 * vencida — vence al terminar el día de pago, o sea recién mañana. El mismo
 * criterio lo usa `recomputeDtePaymentAggregate` vía `isDueDatePast` para que
 * cron y conciliación no se contradigan.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDateOnlyUtcYmd, todayChileStr } from "@/lib/fx-date";

/**
 * Estados SII con deuda viva. `PENDING` entra porque `issueDte` crea el DTE en
 * PENDING y recién el poller lo mueve a ACCEPTED: sin él las facturas nuevas
 * nunca vencerían. Quedan fuera DRAFT (no existe para el cliente), REJECTED
 * (hay que reemitir) y ANNULLED (sin deuda).
 */
const COLLECTIBLE_SII_STATUSES = [
  "PENDING",
  "SENT",
  "ACCEPTED",
  "WITH_OBJECTIONS",
] as const;

/** Notas de crédito: contra-asiento, no se cobran. */
const NON_COLLECTIBLE_DTE_TYPES = [61];

/**
 * Medianoche UTC del día calendario de hoy en Chile. Las columnas `@db.Date`
 * vuelven de Postgres como medianoche UTC, así que este bound deja fuera a las
 * que vencen hoy y toma todas las anteriores.
 */
export function startOfTodayChile(todayYmd: string = todayChileStr()): Date {
  const [y, m, d] = todayYmd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/**
 * ¿El vencimiento ya pasó? Compara días calendario como texto para no depender
 * del ancla horaria del `Date` (Postgres devuelve medianoche UTC; los helpers
 * de `fx-date` construyen mediodía UTC — ambos rinden el mismo YYYY-MM-DD).
 */
export function isDueDatePast(
  dueDate: Date | null | undefined,
  todayYmd: string = todayChileStr(),
): boolean {
  if (!dueDate) return false;
  return formatDateOnlyUtcYmd(dueDate) < todayYmd;
}

/**
 * Estado de pago de un DTE sin cobros registrados.
 *
 * Preserva un OVERDUE previo cuando no hay `dueDate`: en ese caso no tenemos
 * evidencia de que la deuda dejó de estar vencida, y degradarla a UNPAID
 * borraría el trabajo del cron (o de una marca histórica) en el próximo
 * recompute.
 */
export function resolveUnpaidPaymentStatus(
  dueDate: Date | null | undefined,
  currentStatus: string,
  todayYmd: string = todayChileStr(),
): "UNPAID" | "OVERDUE" {
  if (isDueDatePast(dueDate, todayYmd)) return "OVERDUE";
  if (!dueDate && currentStatus === "OVERDUE") return "OVERDUE";
  return "UNPAID";
}

export interface MarkOverdueResult {
  /** Día usado como corte (YYYY-MM-DD en Chile). */
  todayYmd: string;
  /** Cantidad de DTEs que pasaron a OVERDUE. */
  updated: number;
}

/**
 * Pasa a OVERDUE las facturas emitidas UNPAID cuyo vencimiento ya pasó.
 *
 * Solo toca `direction: ISSUED`: es lo que cobramos. Los recibidos (deuda
 * nuestra) mantienen el comportamiento histórico. Tampoco toca PARTIAL —
 * el enum no permite "parcial y vencida" a la vez y perder el PARTIAL
 * escondería que hubo un abono.
 */
export async function markOverdueDtes(opts?: {
  /** Limita el barrido a un tenant (runs dirigidos / tests). */
  tenantId?: string;
  /** Corte explícito YYYY-MM-DD; default hoy en Chile. */
  todayYmd?: string;
}): Promise<MarkOverdueResult> {
  const todayYmd = opts?.todayYmd ?? todayChileStr();
  const cutoff = startOfTodayChile(todayYmd);

  const res = await prisma.financeDte.updateMany({
    where: {
      ...(opts?.tenantId ? { tenantId: opts.tenantId } : {}),
      direction: "ISSUED",
      paymentStatus: "UNPAID",
      dueDate: { lt: cutoff },
      siiStatus: { in: [...COLLECTIBLE_SII_STATUSES] },
      dteType: { notIn: NON_COLLECTIBLE_DTE_TYPES },
      // Anuladas por NC total: saldo cero, no hay nada que cobrar.
      voidedByCreditNoteId: null,
    },
    data: { paymentStatus: "OVERDUE" },
  });

  return { todayYmd, updated: res.count };
}
