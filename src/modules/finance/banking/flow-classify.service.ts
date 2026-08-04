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
    }
  | { kind: "TGR_PICK"; options: TgrPickOption[] }
  | { kind: "DTE_RECEIVED"; dteId: string; label: string }
  | { kind: "NONE" };

export interface RuleFlowRowHit {
  flowRowId: string;
  label: string;
  requiresReview: boolean;
}

export interface PayrollItemHit {
  flowRowId: string;
  label: string;
}

export interface DteReceivedHit {
  dteId: string;
  label: string;
}

export interface RankClassifyInput {
  /** RUT canónico (cleanRut) del beneficiario, o null si no se detectó. */
  beneficiaryRut: string | null;
  /** Monto absoluto CLP de la tx. */
  amountAbs: number;
  /** Hit de regla RUT → FLOW_ROW (ya evaluada). */
  ruleHit?: RuleFlowRowHit | null;
  /** Ítem de nómina pendiente (RUT+monto±tol). */
  payrollItem?: PayrollItemHit | null;
  /** rowId canónico de Turnos extra (fallback persona sin ítem). */
  teRowId?: string | null;
  teRowLabel?: string;
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

/**
 * Cascada de decisión (orden fijo). Devuelve lista ordenada; el primero
 * es la sugerencia principal. Nunca incluye auto-apply — el caller mira
 * requiresReview en FLOW_ROW de regla.
 */
export function rankClassifySuggestions(input: RankClassifyInput): ClassifySuggestion[] {
  const out: ClassifySuggestion[] = [];
  const rut = input.beneficiaryRut ? cleanRut(input.beneficiaryRut) : null;

  // 1. Regla RUT → FLOW_ROW
  if (input.ruleHit) {
    out.push({
      kind: "FLOW_ROW",
      flowRowId: input.ruleHit.flowRowId,
      label: input.ruleHit.label,
      source: "rule",
      requiresReview: input.ruleHit.requiresReview,
    });
    return out;
  }

  // 2. RUT TGR → solo TGR_PICK
  if (rut && isTgrRut(rut)) {
    out.push({
      kind: "TGR_PICK",
      options: ["F29", "FINIQUITO", "CONVENIO_TGR"],
    });
    return out;
  }

  if (rut && isPersonaRut(rut)) {
    // 3a. Persona + ítem nómina pendiente
    if (input.payrollItem) {
      out.push({
        kind: "FLOW_ROW",
        flowRowId: input.payrollItem.flowRowId,
        label: input.payrollItem.label,
        source: "payroll",
        requiresReview: true,
      });
      return out;
    }
    // 3b. Persona sin ítem → Turnos extra
    if (input.teRowId) {
      out.push({
        kind: "FLOW_ROW",
        flowRowId: input.teRowId,
        label: input.teRowLabel ?? "Turnos extra",
        source: "te",
        requiresReview: true,
      });
      return out;
    }
  }

  // 4. Empresa (≥50M): DTE recibido pendiente
  if (rut && !isPersonaRut(rut) && input.dteReceived) {
    out.push({
      kind: "DTE_RECEIVED",
      dteId: input.dteReceived.dteId,
      label: input.dteReceived.label,
    });
    return out;
  }

  // 5. NONE → bandeja
  out.push({ kind: "NONE" });
  return out;
}
