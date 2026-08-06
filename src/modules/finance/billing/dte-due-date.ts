/**
 * Fecha de vencimiento del DTE emitido (`FinanceDte.dueDate`).
 *
 * Hasta ahora ninguna ruta de emisión estampaba `dueDate`: el campo solo se
 * llenaba a mano en DTEs recibidos. Sin vencimiento el DTE nunca puede pasar
 * a OVERDUE ni entrar a la cobranza por tramos, así que la emisión resuelve
 * el término de pago con esta cascada:
 *
 *   1. `explicitDays` — término declarado por el caller (UI / API).
 *   2. `templateDays` / `recurringTemplateId` →
 *      `FinanceDteRecurringTemplate.diasCobroDesdeFactura` (término del contrato).
 *   3. `FinanceCashflowConfig.collectionLagDays` (default del tenant).
 *   4. `DEFAULT_DUE_DATE_LAG_DAYS` (30).
 *
 * `0` es un término válido (cobro contra entrega) y NO cae al siguiente
 * nivel; solo `null`/`undefined` o valores inválidos siguen la cascada.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { parseYmdToDbDate } from "@/lib/fx-date";
import { addDaysYmd } from "@/modules/finance/flow-v3/types";

/**
 * Tipos que nacen fuera del ciclo de cobro y por lo tanto no llevan
 * vencimiento: la Nota de Crédito (61) es contra-asiento de una factura ya
 * emitida y el issuer la marca PAID con saldo 0.
 */
const DTE_TYPES_WITHOUT_DUE_DATE = new Set([61]);

/** Término de pago cuando ni el contrato ni el tenant definen uno. */
export const DEFAULT_DUE_DATE_LAG_DAYS = 30;

export type DueDateSource = "explicit" | "template" | "tenant" | "default";

export interface ResolvedDueDate {
  /** Vencimiento YYYY-MM-DD. */
  dueDateYmd: string;
  /** Días aplicados sobre la fecha de emisión. */
  days: number;
  source: DueDateSource;
}

/** Un término de pago usable: entero ≥ 0. */
function isUsableDays(days: number | null | undefined): days is number {
  return days != null && Number.isInteger(days) && days >= 0;
}

/**
 * Cascada pura (sin BD) del término de pago en días. Expuesta aparte para
 * poder testear la precedencia sin tocar prisma.
 */
export function pickDueDateDays(input: {
  explicitDays?: number | null;
  templateDays?: number | null;
  tenantLagDays?: number | null;
}): { days: number; source: DueDateSource } {
  if (isUsableDays(input.explicitDays)) {
    return { days: input.explicitDays, source: "explicit" };
  }
  if (isUsableDays(input.templateDays)) {
    return { days: input.templateDays, source: "template" };
  }
  if (isUsableDays(input.tenantLagDays)) {
    return { days: input.tenantLagDays, source: "tenant" };
  }
  return { days: DEFAULT_DUE_DATE_LAG_DAYS, source: "default" };
}

/** Vencimiento = emisión + días (aritmética UTC pura, sin corrimiento de TZ). */
export function computeDueDateYmd(issueDateYmd: string, days: number): string {
  return addDaysYmd(issueDateYmd, days);
}

export interface ResolveDueDateArgs {
  tenantId: string;
  /** Fecha de emisión YYYY-MM-DD. */
  issueDateYmd: string;
  /** Término declarado por el caller — gana sobre contrato y tenant. */
  explicitDays?: number | null;
  /**
   * Término del contrato ya en mano (evita la query cuando el caller
   * acaba de leer la programación, p.ej. el cron de recurrentes).
   */
  templateDays?: number | null;
  /** Programación de origen; se consulta solo si no vino `templateDays`. */
  recurringTemplateId?: string | null;
}

/**
 * Resuelve el vencimiento de un DTE a partir de su fecha de emisión.
 * Consulta la programación y/o la config del tenant solo cuando hace falta.
 */
export async function resolveDueDate(
  args: ResolveDueDateArgs,
): Promise<ResolvedDueDate> {
  let templateDays = args.templateDays ?? null;

  if (
    !isUsableDays(args.explicitDays) &&
    !isUsableDays(templateDays) &&
    args.recurringTemplateId
  ) {
    const template = await prisma.financeDteRecurringTemplate.findFirst({
      where: { id: args.recurringTemplateId, tenantId: args.tenantId },
      select: { diasCobroDesdeFactura: true },
    });
    templateDays = template?.diasCobroDesdeFactura ?? null;
  }

  let tenantLagDays: number | null = null;
  if (!isUsableDays(args.explicitDays) && !isUsableDays(templateDays)) {
    const config = await prisma.financeCashflowConfig.findUnique({
      where: { tenantId: args.tenantId },
      select: { collectionLagDays: true },
    });
    tenantLagDays = config?.collectionLagDays ?? null;
  }

  const picked = pickDueDateDays({
    explicitDays: args.explicitDays,
    templateDays,
    tenantLagDays,
  });

  return {
    dueDateYmd: computeDueDateYmd(args.issueDateYmd, picked.days),
    days: picked.days,
    source: picked.source,
  };
}

/**
 * Vencimiento listo para persistir en `FinanceDte.dueDate`. Usado por el
 * issuer y por la creación/edición de borradores para que el mismo criterio
 * aplique en ambos caminos.
 *
 * Devuelve null solo para los tipos sin ciclo de cobro (NC 61).
 */
export async function resolveIssuedDueDate(args: {
  tenantId: string;
  dteType: number;
  /** Fecha de emisión YYYY-MM-DD ya normalizada. */
  emissionYmd: string;
  /** Vencimiento explícito YYYY-MM-DD (form / borrador). */
  explicitDueDate?: string | null;
  explicitDays?: number | null;
  templateDays?: number | null;
  recurringTemplateId?: string | null;
}): Promise<Date | null> {
  if (DTE_TYPES_WITHOUT_DUE_DATE.has(args.dteType)) return null;

  const explicit = args.explicitDueDate?.trim();
  if (explicit) {
    try {
      return parseYmdToDbDate(explicit);
    } catch {
      // Fecha malformada: seguimos con la cascada en vez de romper la emisión.
    }
  }

  const resolved = await resolveDueDate({
    tenantId: args.tenantId,
    issueDateYmd: args.emissionYmd,
    explicitDays: args.explicitDays,
    templateDays: args.templateDays,
    recurringTemplateId: args.recurringTemplateId,
  });
  return parseYmdToDbDate(resolved.dueDateYmd);
}
