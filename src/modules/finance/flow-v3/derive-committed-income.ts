/**
 * Derivador COMPROMETIDO · ingresos (función pura, cero writes).
 *
 * Capas que produce por fila ACCOUNT_INSTALLATION:
 *  1. kind="dte": DTEs emitidos (33/34) no pagados → semana de cobro estimada
 *     (dueDate ?? emisión+30d), clampeada a la semana actual si ya venció.
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
  /** totalAmount − amountPaid, en CLP bruto. */
  pendingClp: number;
  crmAccountId: string | null;
  installationId: string | null;
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

export function deriveCommittedIncome(args: CommittedIncomeArgs): CommittedByRow {
  const out: CommittedByRow = new Map();
  if (args.weeks.length === 0) return out;
  const firstWeek = args.weeks[0];
  const lastWeek = args.weeks[args.weeks.length - 1];
  const inRange = (w: string) => w >= firstWeek && w <= lastWeek;
  const matchRow = buildIncomeMatcher(args.rows);
  const lagDays = args.collectionLagDays ?? DEFAULT_COLLECTION_LAG_DAYS;

  for (const d of args.dtes) {
    const est = d.dueDateYmd ?? addDaysYmd(d.dateYmd, d.templateDiasCobro ?? lagDays);
    const { week, fecha } = collectionWeek(est, args.todayYmd);
    if (!inRange(week) || d.pendingClp <= 0) continue;
    pushCommitted(out, matchRow(d.crmAccountId, d.installationId), week, {
      kind: "dte",
      dteId: d.id,
      folio: d.folio,
      label: d.receiverName,
      fecha,
      monto: Math.round(d.pendingClp),
    });
  }

  for (const dr of args.drafts) {
    const est = addDaysYmd(dr.dateYmd, dr.templateDiasCobro ?? lagDays);
    const { week, fecha } = collectionWeek(est, args.todayYmd);
    if (!inRange(week) || dr.totalClp <= 0) continue;
    pushCommitted(out, matchRow(dr.crmAccountId, dr.installationId), week, {
      kind: "scheduled",
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
          pushCommitted(out, matchRow(tpl.crmAccountId, tpl.installationId), week, {
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
