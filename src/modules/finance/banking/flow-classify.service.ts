/**
 * Clasificación de movimientos bancarios hacia filas de flujo / TGR / DTE.
 * Cascada pura (rankClassifySuggestions) + helpers de normalización.
 * Nunca auto-aplica salvo regla con requiresReview === false (caller decide).
 */

import { cleanRut } from "@/lib/chile-rut";

/** RUT TGR (Tesorería General de la República), canónico sin puntos/guion. */
export const TGR_RUT = "618080005";

/** Umbral cuerpo RUT: < 50M = persona natural; ≥ 50M = empresa. */
export const PERSONA_RUT_BODY_MAX = 50_000_000;

export type TgrPickOption = "F29" | "FINIQUITO" | "CONVENIO_TGR";

export type ClassifySuggestion =
  | {
      kind: "FLOW_ROW";
      flowRowId: string;
      label: string;
      source: "rule" | "payroll" | "te" | "heuristic";
      requiresReview?: boolean;
      reason: string;
    }
  | { kind: "TGR_PICK"; options: TgrPickOption[]; reason: string }
  | { kind: "DTE_RECEIVED"; dteId: string; label: string; reason: string }
  | { kind: "NONE"; reason: string };

export interface RuleFlowRowHit {
  flowRowId: string;
  label: string;
  requiresReview: boolean;
  /** Nombre de la regla (motivo). Si falta, se usa label. */
  ruleName?: string;
  /** Prioridad de la regla, para el motivo. */
  priority?: number;
}

export interface PayrollItemHit {
  flowRowId: string;
  label: string;
}

export interface DteReceivedHit {
  dteId: string;
  label: string;
}

export interface FlowRowDest {
  flowRowId: string;
  label: string;
}

/** Candidato de nómina/finiquito (contrato puro; sin desglose). */
export interface PayrollCandidateHit {
  kind: "LIQUIDACION" | "ANTICIPO" | "FINIQUITO";
  guardiaId: string;
  amount: number;
  label: string;
  refId: string;
}

export interface GuardiaStateHit {
  status: string;
  lifecycleStatus: string;
  terminatedAt: string | null;
  installationName: string | null;
  availableExtraShifts: boolean;
}

export interface RankClassifyInput {
  /** RUT canónico (cleanRut) del beneficiario, o null si no se detectó. */
  beneficiaryRut: string | null;
  /** Monto absoluto CLP de la tx. */
  amountAbs: number;
  /** Tolerancia CLP (FinanceCashflowConfig.matchAmountToleranceClp). */
  amountToleranceClp?: number;
  /** Hit de regla RUT → FLOW_ROW (ya evaluada). */
  ruleHit?: RuleFlowRowHit | null;
  /**
   * Estado laboral si el RUT es guardia registrado.
   * Sustituye a isPersonaRut como entrada primaria de la rama persona.
   */
  guardiaState?: GuardiaStateHit | null;
  /** Candidatos de nómina/finiquito del guardia (sin desglose). */
  payrollCandidates?: PayrollCandidateHit[];
  /** Filas destino por tipo de candidato. */
  liquidacionRow?: FlowRowDest | null;
  anticipoRow?: FlowRowDest | null;
  finiquitoRow?: FlowRowDest | null;
  /** @deprecated Preferir payrollCandidates + *Row. Mantener para compat tests legacy. */
  payrollItem?: PayrollItemHit | null;
  /** rowId canónico de Turnos extra (solo guardias habilitados para TE). */
  teRowId?: string | null;
  teRowLabel?: string;
  /** Fila Retiro socios (persona natural / guardia no habilitado para TE). */
  retiroSocioRow?: FlowRowDest | null;
  /** Fila de flujo resuelta desde categoría habitual del proveedor. */
  supplierCategoryRow?: FlowRowDest | null;
  /** Nombre de categoría para el motivo (opcional). */
  supplierCategoryName?: string | null;
  /** DTE recibido pendiente (empresa, RUT+monto≈). */
  dteReceived?: DteReceivedHit | null;
}

/** Normaliza RUT al canónico del repo (dígitos + K). */
export function normalizeClassifyRut(rut: string | null | undefined): string | null {
  if (!rut) return null;
  const c = cleanRut(rut);
  return c.length >= 2 ? c : null;
}

/** ¿Es RUT de persona natural? (cuerpo numérico < 50M). */
export function isPersonaRut(rutCanon: string): boolean {
  const body = rutCanon.slice(0, -1);
  const n = Number(body);
  return Number.isFinite(n) && n > 0 && n < PERSONA_RUT_BODY_MAX;
}

export function isTgrRut(rutCanon: string | null): boolean {
  if (!rutCanon) return false;
  return cleanRut(rutCanon) === TGR_RUT;
}

function amountMatches(
  candidateAmount: number,
  amountAbs: number,
  tol: number,
): boolean {
  return Math.abs(candidateAmount - amountAbs) <= tol;
}

function pickCandidate(
  candidates: PayrollCandidateHit[],
  kind: PayrollCandidateHit["kind"],
  amountAbs: number,
  tol: number,
): PayrollCandidateHit | null {
  const hits = candidates.filter(
    (c) => c.kind === kind && amountMatches(c.amount, amountAbs, tol),
  );
  if (hits.length === 0) return null;
  // Más antigua primero (orden del loader: liquidaciones por período ASC).
  return hits[0]!;
}

function pickFirstCandidate(
  candidates: PayrollCandidateHit[],
  kind: PayrollCandidateHit["kind"],
): PayrollCandidateHit | null {
  return candidates.find((c) => c.kind === kind) ?? null;
}

/** Guardia con término de relación laboral registrado. */
export function isGuardiaTerminated(
  guardiaState: GuardiaStateHit | null | undefined,
): boolean {
  if (!guardiaState) return false;
  return (
    !!guardiaState.terminatedAt || guardiaState.lifecycleStatus === "inactivo"
  );
}

/**
 * Turnos extra solo si hay ficha guardia, está activo y marcado disponible
 * para TE (`availableExtraShifts`). Socios/directores suelen tener ficha pero
 * con TE deshabilitado; personas naturales sin ficha tampoco califican.
 */
export function canSuggestTurnoExtra(
  guardiaState: GuardiaStateHit | null | undefined,
  hasGuardiaRecord: boolean,
): boolean {
  if (!hasGuardiaRecord || !guardiaState) return false;
  if (!guardiaState.availableExtraShifts) return false;
  if (isGuardiaTerminated(guardiaState)) return false;
  return true;
}

function formatClp(amount: number): string {
  return `$${Math.round(amount).toLocaleString("es-CL")}`;
}

function finiquitoReason(
  fin: PayrollCandidateHit,
  amountAbs: number,
  tol: number,
): string {
  const datePart = fin.label.replace(/^Finiquito\s+/i, "");
  if (amountMatches(fin.amount, amountAbs, tol)) {
    return `Finiquito registrado ${datePart}`;
  }
  return `Finiquito registrado ${datePart}; monto difiere (registrado ${formatClp(fin.amount)})`;
}

function teReason(guardiaState: GuardiaStateHit | null | undefined): string {
  if (!guardiaState) {
    return "Guardia habilitado para TE, sin liquidación que calce";
  }
  if (!guardiaState.installationName) {
    return "Guardia habilitado para TE, sin puesto activo";
  }
  return "Guardia habilitado para TE, sin liquidación que calce";
}

function retiroSocioReason(
  guardiaState: GuardiaStateHit | null | undefined,
  hasGuardiaRecord: boolean,
): string {
  if (hasGuardiaRecord && guardiaState && !guardiaState.availableExtraShifts) {
    return "Persona en nómina sin turnos extra; posible retiro de socios";
  }
  if (hasGuardiaRecord && isGuardiaTerminated(guardiaState)) {
    return "Guardia finiquitado; verificar retiro u otro egreso";
  }
  return "Persona natural; posible retiro de socios u otro egreso";
}

function noneReason(input: RankClassifyInput, rut: string | null): string {
  if (!rut) return "Sin identidad conocida para este RUT";
  if (input.supplierCategoryRow) {
    return "Primera vez que aparece este comerciante";
  }
  return "Sin identidad conocida para este RUT";
}

/**
 * Cascada de decisión (orden fijo §5.2). Devuelve lista ordenada; el primero
 * es la sugerencia principal. Nunca incluye auto-apply — el caller mira
 * requiresReview en FLOW_ROW de regla.
 *
 * Orden: regla → TGR → finiquito → liquidación → anticipo → finiquito
 * (sin calce) → turno extra (solo TE habilitado) → retiro socios → proveedor
 * → DTE → NONE.
 */
export function rankClassifySuggestions(input: RankClassifyInput): ClassifySuggestion[] {
  const out: ClassifySuggestion[] = [];
  const rut = input.beneficiaryRut ? cleanRut(input.beneficiaryRut) : null;
  const tol = input.amountToleranceClp ?? 5000;
  const candidates = input.payrollCandidates ?? [];
  const hasGuardia = input.guardiaState != null;
  // isPersonaRut solo como fallback cuando no hay identidad de guardia.
  const personaFallback = !hasGuardia && !!rut && isPersonaRut(rut);
  const isPersonaBranch = hasGuardia || personaFallback;
  const teEligible = canSuggestTurnoExtra(input.guardiaState, hasGuardia);

  // 1. Regla RUT → FLOW_ROW
  if (input.ruleHit) {
    const ruleTitle = input.ruleHit.ruleName ?? input.ruleHit.label;
    const prio =
      typeof input.ruleHit.priority === "number"
        ? ` · prioridad ${input.ruleHit.priority}`
        : "";
    out.push({
      kind: "FLOW_ROW",
      flowRowId: input.ruleHit.flowRowId,
      label: input.ruleHit.label,
      source: "rule",
      requiresReview: input.ruleHit.requiresReview,
      reason: `Regla «${ruleTitle}»${prio}`,
    });
    return out;
  }

  // 2. RUT TGR → solo TGR_PICK
  if (rut && isTgrRut(rut)) {
    out.push({
      kind: "TGR_PICK",
      options: ["F29", "FINIQUITO", "CONVENIO_TGR"],
      reason: "Tesorería · requiere elección",
    });
    return out;
  }

  if (isPersonaBranch) {
    // 3. Finiquito aprobado que calza por monto
    const fin = pickCandidate(candidates, "FINIQUITO", input.amountAbs, tol);
    if (fin && input.finiquitoRow) {
      out.push({
        kind: "FLOW_ROW",
        flowRowId: input.finiquitoRow.flowRowId,
        label: input.finiquitoRow.label,
        source: "payroll",
        requiresReview: true,
        reason: finiquitoReason(fin, input.amountAbs, tol),
      });
      return out;
    }

    // 4. Liquidación APPROVED sin paidAt que calza
    const liq = pickCandidate(candidates, "LIQUIDACION", input.amountAbs, tol);
    if (liq && input.liquidacionRow) {
      out.push({
        kind: "FLOW_ROW",
        flowRowId: input.liquidacionRow.flowRowId,
        label: input.liquidacionRow.label,
        source: "payroll",
        requiresReview: true,
        reason: `${liq.label} pendiente, calza exacto`,
      });
      return out;
    }

    // Compat: payrollItem legacy (tests / callers viejos)
    if (input.payrollItem) {
      out.push({
        kind: "FLOW_ROW",
        flowRowId: input.payrollItem.flowRowId,
        label: input.payrollItem.label,
        source: "payroll",
        requiresReview: true,
        reason: `${input.payrollItem.label} pendiente, calza exacto`,
      });
      return out;
    }

    // 5. Anticipo PENDING que calza
    const ant = pickCandidate(candidates, "ANTICIPO", input.amountAbs, tol);
    if (ant && input.anticipoRow) {
      out.push({
        kind: "FLOW_ROW",
        flowRowId: input.anticipoRow.flowRowId,
        label: input.anticipoRow.label,
        source: "payroll",
        requiresReview: true,
        reason: "Anticipo pendiente, calza exacto",
      });
      return out;
    }

    // 5b. Guardia finiquitado: preferir fila Finiquitos aunque el monto no calce
    if (isGuardiaTerminated(input.guardiaState) && input.finiquitoRow) {
      const finAny = pickFirstCandidate(candidates, "FINIQUITO");
      out.push({
        kind: "FLOW_ROW",
        flowRowId: input.finiquitoRow.flowRowId,
        label: input.finiquitoRow.label,
        source: "payroll",
        requiresReview: true,
        reason: finAny
          ? finiquitoReason(finAny, input.amountAbs, tol)
          : "Guardia finiquitado; sin finiquito registrado que calce",
      });
      return out;
    }

    // 6. Turno extra — solo guardias activos con availableExtraShifts
    if (teEligible && input.teRowId) {
      out.push({
        kind: "FLOW_ROW",
        flowRowId: input.teRowId,
        label: input.teRowLabel ?? "Turnos extra",
        source: "te",
        requiresReview: true,
        reason: teReason(input.guardiaState),
      });
      return out;
    }

    // 6b. Persona natural / guardia no-TE → retiro socios (heurística)
    if (input.retiroSocioRow) {
      out.push({
        kind: "FLOW_ROW",
        flowRowId: input.retiroSocioRow.flowRowId,
        label: input.retiroSocioRow.label,
        source: "heuristic",
        requiresReview: true,
        reason: retiroSocioReason(input.guardiaState, hasGuardia),
      });
      return out;
    }
  }

  // 7. Proveedor con categoría habitual → fila
  if (input.supplierCategoryRow) {
    const catName = input.supplierCategoryName ?? input.supplierCategoryRow.label;
    out.push({
      kind: "FLOW_ROW",
      flowRowId: input.supplierCategoryRow.flowRowId,
      label: input.supplierCategoryRow.label,
      source: "heuristic",
      requiresReview: true,
      reason: `Proveedor · categoría ${catName}`,
    });
    return out;
  }

  // 8. Empresa / DTE recibido pendiente
  if (rut && !isPersonaRut(rut) && input.dteReceived) {
    out.push({
      kind: "DTE_RECEIVED",
      dteId: input.dteReceived.dteId,
      label: input.dteReceived.label,
      reason: input.dteReceived.label.startsWith("Factura")
        ? input.dteReceived.label
        : `Factura ${input.dteReceived.label}`,
    });
    return out;
  }

  // 9. NONE → bandeja
  out.push({ kind: "NONE", reason: noneReason(input, rut) });
  return out;
}
