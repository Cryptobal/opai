/**
 * Derivador COMPROMETIDO · ingresos (función pura, cero writes).
 *
 * Capas que produce por fila ACCOUNT_INSTALLATION:
 *  0. kind="draft": borradores reales de programación (con proformaSent si el
 *     estado de pago ya se envió al cliente).
 *  1. kind="dte": DTEs emitidos (33/34) no pagados → semana de la FECHA DE
 *     EMISIÓN (o override de visibilidad si el usuario la movió). Regla de
 *     producto alineada con cashflow v2: manda el DTE emitido, no el término
 *     de pago. Si esa semana ya pasó, se clampea a la semana actual para que
 *     la cartera vencida siga visible en el horizonte operable.
 *  2. kind="scheduled": borradores de programación (DRAFT con template) y
 *     proyección de FinanceDteRecurringTemplate activas hasta `endDate`
 *     inclusive (contratos a plazo dejan de proyectarse solos al término).
 *     Dedupe period-aware: si existe un DTE (borrador o emitido) con
 *     (recurringTemplateId, billingPeriod) de la cuota, la cuota no se proyecta.
 */
import {
  computeNextRunAt,
  computeRecurringIssueYmd,
} from "@/modules/finance/billing/dte-recurring-schedule";
import { weekStartYmd, ymdToDate } from "./weeks";
import { buildIncomeMatcher } from "./row-match";
import {
  addDaysYmd,
  DEFAULT_COLLECTION_LAG_DAYS,
  pushCommitted,
  type CommittedByRow,
  type FlowRowRef,
} from "./types";

export interface IssuedDteInput {
  id: string;
  folio: number;
  dateYmd: string;
  dueDateYmd: string | null;
  /**
   * Override de visibilidad en el flujo (`FinanceCashflowDteDateOverride`).
   * Si existe, la factura se ubica en esa fecha en vez de la de emisión.
   */
  overrideDateYmd?: string | null;
  /** totalAmount − amountPaid, en CLP bruto. */
  pendingClp: number;
  crmAccountId: string | null;
  installationId: string | null;
  /** Programación origen — rutea a la fila 1:1 del template. */
  recurringTemplateId?: string | null;
  receiverName: string;
  /** Término del contrato origen (template) si la factura viene de uno. */
  templateDiasCobro?: number | null;
}

export interface ScheduledDraftInput {
  id: string;
  templateId: string;
  dateYmd: string;
  totalClp: number;
  receiverName: string;
  crmAccountId: string | null;
  installationId: string | null;
  /** Proforma/estado de pago ya enviada al cliente. */
  proformaSent?: boolean;
  templateEndDateYmd: string | null;
  templateDiasCobro?: number | null;
}

export interface TemplateProjectionInput {
  id: string;
  name: string;
  crmAccountId: string | null;
  installationId: string | null;
  frequency: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  startDate: Date;
  endDate: Date | null;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  facturaTiming: string;
  facturaDay: number | null;
  facturaMesRelativo: string;
  /** Monto bruto CLP por cuota, ya resuelto por el loader (líneas + IVA + UF). */
  grossPerRunClp: number;
  /** Término de pago del contrato (null = default del tenant). */
  diasCobro?: number | null;
}

export interface CommittedIncomeArgs {
  rows: FlowRowRef[];
  weeks: string[]; // lunes ISO del rango, asc
  todayYmd: string;
  dtes: IssuedDteInput[];
  drafts: ScheduledDraftInput[];
  templates: TemplateProjectionInput[];
  /** Set "templateId::YYYY-MM" de períodos ya cubiertos por un DTE real/borrador. */
  coveredPeriods: Set<string>;
  /** Término de pago (días) cuando no hay dueDate. Default 30 (config F1). */
  collectionLagDays?: number;
}

/** Semana (lunes YMD) de cobro estimada, clampeada a la semana actual si venció. */
function collectionWeek(fechaYmd: string, todayYmd: string): { week: string; fecha: string } {
  const currentWeek = weekStartYmd(ymdToDate(todayYmd) ?? new Date());
  const week = weekStartYmd(ymdToDate(fechaYmd) ?? new Date());
  return week < currentWeek ? { week: currentWeek, fecha: fechaYmd } : { week, fecha: fechaYmd };
}

/** Días calendarios UTC de `fromYmd` a `toYmd` (positivo si to > from). */
function daysBetween(fromYmd: string, toYmd: string): number {
  const a = ymdToDate(fromYmd);
  const b = ymdToDate(toYmd);
  if (!a || !b) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

export function deriveCommittedIncome(args: CommittedIncomeArgs): CommittedByRow {
  const out: CommittedByRow = new Map();
  if (args.weeks.length === 0) return out;
  const firstWeek = args.weeks[0];
  const lastWeek = args.weeks[args.weeks.length - 1];
  const inRange = (w: string) => w >= firstWeek && w <= lastWeek;
  const matchRow = buildIncomeMatcher(args.rows);
  const lagDays = args.collectionLagDays ?? DEFAULT_COLLECTION_LAG_DAYS;

  for (const d of args.dtes) {
    // Emitida: manda la factura (emisión) o el override manual de cobro.
    // dueDate / término de pago NO desplazan la celda — el usuario mueve la
    // factura cuando el pago se aplaza (override de visibilidad).
    const placementYmd = d.overrideDateYmd ?? d.dateYmd;
    const { week, fecha } = collectionWeek(placementYmd, args.todayYmd);
    if (!inRange(week) || d.pendingClp <= 0) continue;
    // Cartera zombie: vencimiento contractual (dueDate o emisión+lag), no la
    // celda de visibilidad — una factura recién emitida no es "vencida".
    const dueYmd = d.dueDateYmd ?? addDaysYmd(d.dateYmd, d.templateDiasCobro ?? lagDays);
    pushCommitted(out, matchRow(d.crmAccountId, d.installationId, d.recurringTemplateId), week, {
      kind: "dte",
      dteId: d.id,
      folio: d.folio,
      label: d.receiverName,
      fecha,
      monto: Math.round(d.pendingClp),
      overdueOver60: daysBetween(dueYmd, args.todayYmd) > 60,
    });
  }

  for (const dr of args.drafts) {
    const est = addDaysYmd(dr.dateYmd, dr.templateDiasCobro ?? lagDays);
    const { week, fecha } = collectionWeek(est, args.todayYmd);
    if (!inRange(week) || dr.totalClp <= 0) continue;
    pushCommitted(out, matchRow(dr.crmAccountId, dr.installationId, dr.templateId), week, {
      // Borrador real (ocupa el período de su template) — distinto de una
      // cuota proyectada: tiene documento y puede llevar proforma enviada.
      kind: "draft",
      proformaSent: dr.proformaSent === true,
      dteId: dr.id,
      templateId: dr.templateId,
      label: dr.receiverName,
      fecha,
      monto: Math.round(dr.totalClp),
      endDate: dr.templateEndDateYmd,
    });
  }

  const horizonEnd = ymdToDate(lastWeek);
  for (const tpl of args.templates) {
    if (tpl.grossPerRunClp <= 0 || !horizonEnd) continue;
    const endYmd = tpl.endDate ? tpl.endDate.toISOString().slice(0, 10) : null;
    let anchor = tpl.nextRunAt ?? computeNextRunAt(tpl);
    let guard = 0;
    // Margen: la emisión puede caer semanas antes del cobro; proyectamos
    // anchors hasta fin de rango (el cobro cae ≥ anchor, se filtra por semana).
    while (anchor && guard < 130) {
      guard += 1;
      if (tpl.endDate && anchor > tpl.endDate) break; // endDate inclusive
      const period = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}`;
      const issueYmd = computeRecurringIssueYmd(tpl, anchor);
      if (issueYmd > lastWeek) break;
      if (!args.coveredPeriods.has(`${tpl.id}::${period}`)) {
        const est = addDaysYmd(issueYmd, tpl.diasCobro ?? lagDays);
        const { week, fecha } = collectionWeek(est, args.todayYmd);
        if (inRange(week)) {
          pushCommitted(out, matchRow(tpl.crmAccountId, tpl.installationId, tpl.id), week, {
            kind: "scheduled",
            templateId: tpl.id,
            label: tpl.name,
            fecha,
            monto: Math.round(tpl.grossPerRunClp),
            endDate: endYmd,
            diasCobro: tpl.diasCobro ?? null,
          });
        }
      }
      anchor = computeNextRunAt(tpl, anchor);
    }
  }

  return out;
}
