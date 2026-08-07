/**
 * Derivador COMPROMETIDO · ingresos (función pura, cero writes).
 *
 * Capas que produce por fila ACCOUNT_INSTALLATION:
 *  0. kind="draft": borradores reales de programación (con sentDocs si
 *     proforma y/o estado de pago ya se enviaron al cliente).
 *  1. kind="dte": DTEs emitidos (33/34) no pagados → semana de la FECHA DE
 *     EMISIÓN (o override de visibilidad si el usuario la movió). Regla de
 *     producto: una factura emitida impaga NUNCA se arrastra a la semana
 *     actual; vive en su semana de emisión/override hasta que el owner la
 *     mueva a mano o se pague. `overdueDays` se calcula contra hoy.
 *  2. kind="scheduled": proyección de FinanceDteRecurringTemplate activas
 *     hasta `endDate` inclusive. Celda = semana de emisión (issueYmd), sin
 *     lag de cobro (v4.7). Dedupe period-aware: si existe un DTE (borrador
 *     o emitido) con (recurringTemplateId, billingPeriod) de la cuota, la
 *     cuota no se proyecta.
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
  terminoInfo,
  UNMATCHED_INCOME_KEY,
  type CommittedByRow,
  type FlowRowRef,
  type SentDocs,
} from "./types";
import {
  computeOverdueDays,
  type CessionInfo,
  type DueDateSource,
} from "./overdue";

/** DTE emitido que no resolvió fila (panel "Facturas sin fila"). */
export interface UnroutedIncomeDte {
  dteId: string;
  folio: number;
  label: string;
  fecha: string;
  monto: number;
  crmAccountId: string | null;
  installationId: string | null;
  recurringTemplateId?: string | null;
}

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
  /** Destino explícito elegido al emitir. null/undefined = ruteo automático. */
  flowRouting?: "OWN_ROW" | "OTHER_INCOME" | null;
  receiverName: string;
  /** Término del contrato origen (template) si la factura viene de uno. */
  templateDiasCobro?: number | null;
  /**
   * @deprecated Preferir `cession`. Conservado para tests legacy.
   * paymentStatus=CEDED — sigue en planilla con marca secundaria.
   */
  ceded?: boolean;
  /** Estado de pago del DTE (UNPAID/PARTIAL/OVERDUE/CEDED/…). */
  paymentStatus?: string;
  /** Cesión vigente resuelta (operación activa o fallback CEDED). */
  cession?: CessionInfo | null;
  /** Retención comercial de cesión partida (fila "Cliente 20%"). */
  isCededRetention?: boolean;
  /** Días de término aplicados / mostrados en ficha. */
  termDays?: number | null;
  termSource?: DueDateSource;
  /** Celda ya conciliada con banco (no genera mora). */
  reconciled?: boolean;
  /** Anulada por nota de crédito. */
  voided?: boolean;
}

export interface ScheduledDraftInput {
  id: string;
  templateId: string;
  dateYmd: string;
  totalClp: number;
  receiverName: string;
  crmAccountId: string | null;
  installationId: string | null;
  /** Proforma / Estado de Pago enviados (documentos distintos). */
  sentDocs?: SentDocs;
  templateEndDateYmd: string | null;
  /** Término explícito de la programación (null = no configurado). */
  templateDiasCobro?: number | null;
  /** Override de visibilidad del borrador (misma tabla que emitidos). */
  overrideDateYmd?: string | null;
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
  /** Término de pago del contrato (null = no configurado; no inventar lag). */
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
  /**
   * Lag default del tenant. Solo para "vencida hace N días" de emitidas
   * sin dueDate. Ya NO desplaza cuotas ni borradores (v4.7).
   */
  collectionLagDays?: number;
  /**
   * Si true, DTEs emitidos sin fila NO entran a la bandeja "Otros ingresos"
   * (se listan en `unrouted`). Default false en la función pura (tests);
   * el loader pasa el valor del tenant (schema default true).
   */
  bandejaIncomeBankOnly?: boolean;
}

export interface DeriveCommittedIncomeResult {
  committed: CommittedByRow;
  unrouted: UnroutedIncomeDte[];
}

/**
 * Semana (lunes YMD) de colocación.
 * - `clampOverdue=true` (drafts/scheduled sin override): si venció, mueve a
 *   la semana actual — facturación pendiente de correr, el owner debe verla hoy.
 * - `clampOverdue=false` (DTEs emitidos y drafts con override): se queda en
 *   su semana natural. El override manda.
 */
function collectionWeek(
  fechaYmd: string,
  todayYmd: string,
  clampOverdue = true,
): { week: string; fecha: string } {
  const week = weekStartYmd(ymdToDate(fechaYmd) ?? new Date());
  if (!clampOverdue) return { week, fecha: fechaYmd };
  const currentWeek = weekStartYmd(ymdToDate(todayYmd) ?? new Date());
  return week < currentWeek ? { week: currentWeek, fecha: fechaYmd } : { week, fecha: fechaYmd };
}

export function deriveCommittedIncome(args: CommittedIncomeArgs): DeriveCommittedIncomeResult {
  const out: CommittedByRow = new Map();
  const unrouted: UnroutedIncomeDte[] = [];
  if (args.weeks.length === 0) return { committed: out, unrouted };
  const firstWeek = args.weeks[0];
  const lastWeek = args.weeks[args.weeks.length - 1];
  const inRange = (w: string) => w >= firstWeek && w <= lastWeek;
  const matchRow = buildIncomeMatcher(args.rows);
  const bankOnly = args.bandejaIncomeBankOnly === true;
  // Lag SOLO para vencimiento informativo de emitidas sin dueDate.
  const lagDays = args.collectionLagDays ?? DEFAULT_COLLECTION_LAG_DAYS;

  for (const d of args.dtes) {
    // Emitida: manda la factura (emisión) o el override manual de cobro.
    // dueDate / término de pago NO desplazan la celda — el usuario mueve la
    // factura cuando el pago se aplaza (override de visibilidad).
    const placementYmd = d.overrideDateYmd ?? d.dateYmd;
    // Emitidas: sin clamp — anclaje en emisión/override (v4.5).
    const { week, fecha } = collectionWeek(placementYmd, args.todayYmd, false);
    if (!inRange(week) || d.pendingClp <= 0) continue;
    // Cartera zombie: vencimiento contractual (dueDate o emisión+lag), no la
    // celda de visibilidad — una factura recién emitida no es "vencida".
    const termDays = d.termDays ?? d.templateDiasCobro ?? lagDays;
    const dueYmd = d.dueDateYmd ?? addDaysYmd(d.dateYmd, termDays);
    const cession =
      d.cession ??
      (d.ceded === true
        ? {
            active: true,
            pct: 100,
            factorName: null,
            funded: false,
            dueYmd: null,
          }
        : null);
    const paymentStatus =
      d.paymentStatus ?? (d.ceded === true ? "CEDED" : "UNPAID");
    const overdueDays = computeOverdueDays({
      dueYmd,
      todayYmd: args.todayYmd,
      pendingClp: d.pendingClp,
      paymentStatus,
      cession,
      reconciled: d.reconciled === true,
      voided: d.voided === true,
      isCededRetention: d.isCededRetention === true,
    });
    const cededPct = cession?.active ? cession.pct : 0;
    const ceded = cededPct > 0 || d.ceded === true;
    // Destino explícito OTHER_INCOME prevalece sobre matcher y bandejaIncomeBankOnly.
    const forcedOther = d.flowRouting === "OTHER_INCOME";
    const rowKey = forcedOther
      ? UNMATCHED_INCOME_KEY
      : matchRow(d.crmAccountId, d.installationId, d.recurringTemplateId);
    if (bankOnly && rowKey === UNMATCHED_INCOME_KEY && !forcedOther) {
      unrouted.push({
        dteId: d.id,
        folio: d.folio,
        label: d.receiverName,
        fecha,
        monto: Math.round(d.pendingClp),
        crmAccountId: d.crmAccountId,
        installationId: d.installationId,
        recurringTemplateId: d.recurringTemplateId,
      });
      continue;
    }
    pushCommitted(out, rowKey, week, {
      kind: "dte",
      dteId: d.id,
      folio: d.folio,
      label: d.receiverName,
      fecha,
      monto: Math.round(d.pendingClp),
      overdueDays,
      overdueOver60: overdueDays > 60,
      emissionYmd: d.dateYmd,
      dueYmd,
      ceded,
      cededPct: ceded ? cededPct || 100 : undefined,
      factorName: cession?.factorName ?? null,
      factoringFunded: cession?.funded === true,
      cesionDueYmd: cession?.dueYmd ?? null,
      termDays: d.termDays ?? d.templateDiasCobro ?? null,
      termSource: d.termSource,
      isCededRetention: d.isCededRetention === true,
      crmAccountId: d.crmAccountId,
    });
  }

  for (const dr of args.drafts) {
    // v4.7: ancla en fecha del documento u override. Sin +diasCobro / lag.
    const hasOverride = !!dr.overrideDateYmd;
    const placementYmd = dr.overrideDateYmd ?? dr.dateYmd;
    // Con override el owner mandó: sin clamp. Sin override: clamp v4.5.
    const { week, fecha } = collectionWeek(placementYmd, args.todayYmd, !hasOverride);
    if (!inRange(week) || dr.totalClp <= 0) continue;
    const term = terminoInfo(dr.dateYmd, dr.templateDiasCobro);
    const sentDocs: SentDocs = {
      proforma: dr.sentDocs?.proforma === true,
      estadoPago: dr.sentDocs?.estadoPago === true,
    };
    pushCommitted(out, matchRow(dr.crmAccountId, dr.installationId, dr.templateId), week, {
      kind: "draft",
      sentDocs,
      dteId: dr.id,
      templateId: dr.templateId,
      label: dr.receiverName,
      fecha,
      monto: Math.round(dr.totalClp),
      endDate: dr.templateEndDateYmd,
      issueYmd: term.issueYmd,
      terminoDias: term.terminoDias,
      cobroEstYmd: term.cobroEstYmd,
    });
  }

  const horizonEnd = ymdToDate(lastWeek);
  for (const tpl of args.templates) {
    if (tpl.grossPerRunClp <= 0 || !horizonEnd) continue;
    const endYmd = tpl.endDate ? tpl.endDate.toISOString().slice(0, 10) : null;
    let anchor = tpl.nextRunAt ?? computeNextRunAt(tpl);
    let guard = 0;
    // Proyectamos anchors hasta fin de rango; la celda es la semana de emisión.
    while (anchor && guard < 130) {
      guard += 1;
      if (tpl.endDate && anchor > tpl.endDate) break; // endDate inclusive
      const period = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}`;
      const issueYmd = computeRecurringIssueYmd(tpl, anchor);
      if (issueYmd > lastWeek) break;
      if (!args.coveredPeriods.has(`${tpl.id}::${period}`)) {
        // v4.7: celda = semana de emisión. Sin +diasCobro / lag.
        const { week, fecha } = collectionWeek(issueYmd, args.todayYmd);
        if (inRange(week)) {
          const term = terminoInfo(issueYmd, tpl.diasCobro);
          pushCommitted(out, matchRow(tpl.crmAccountId, tpl.installationId, tpl.id), week, {
            kind: "scheduled",
            templateId: tpl.id,
            label: tpl.name,
            fecha,
            monto: Math.round(tpl.grossPerRunClp),
            endDate: endYmd,
            issueYmd: term.issueYmd,
            terminoDias: term.terminoDias,
            cobroEstYmd: term.cobroEstYmd,
          });
        }
      }
      anchor = computeNextRunAt(tpl, anchor);
    }
  }

  return { committed: out, unrouted };
}
