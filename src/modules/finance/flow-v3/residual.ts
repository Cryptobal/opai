/**
 * Cálculo puro del residual (saldo por ejecutar) de una celda de planilla.
 * Sin prisma ni server-only: lo importan el ensamblado y la UI.
 *
 * Modelo (semana no pasada):
 *   effective = realSigned + committedNetCash + residual
 *
 * - committedNet: Σ items kind === "dte" (ya neto de amountPaid).
 * - committedGross: hitos / cuotas / borradores (brutos).
 * - Plan manual (!invoiced) pisa TODO el comprometido.
 * - residualCarryEnabled=false + real ≠ 0 ⇒ solo real (legado).
 */

export type SettlementMode = "AUTO" | "CLOSED";

export interface CellExecution {
  /** Magnitud proyectada bruta (sin la parte neta de facturas). */
  projected: number;
  /** Magnitud realmente ejecutada en la dirección del proyectado. */
  real: number;
  /** Cash-signed. Lo que falta por ejecutar. 0 si no aplica. */
  residual: number;
  /** Magnitud ejecutada por sobre el proyectado. 0 si no aplica. */
  over: number;
  /** real / projected × 100. null si projected === 0. */
  pct: number | null;
  state: "partial" | "complete" | "over" | "closed" | "none";
  settlement: SettlementMode;
}

/**
 * Filas FINANCIAMIENTO que son egreso de caja. Si el plan llega como magnitud
 * positiva (editor con Math.abs), se fuerza a negativo cash-signed.
 * APORTE_SOCIO / CREDITO / sin key siguen “tal como se tipeó”.
 */
export const FINANCING_OUTFLOW_KEYS: ReadonlySet<string> = new Set([
  "RETIRO_SOCIO",
  "DEVOL_PRESTAMO_SOCIO",
  "FACTORING",
]);

/** Normaliza el monto de plan antes de persistir / proyectar. */
export function normalizeFinancingPlanAmount(
  section: string,
  amount: number,
  canonicalKey?: string | null,
): number {
  if (!Number.isFinite(amount) || amount === 0) return amount || 0;
  if (section !== "FINANCIAMIENTO") return amount;
  if (canonicalKey && FINANCING_OUTFLOW_KEYS.has(canonicalKey)) {
    return -Math.abs(amount);
  }
  return amount;
}

/**
 * Plan cash-signed: INGRESOS +, FINANCIAMIENTO tipado (egresos canónicos
 * siempre −), resto −.
 */
export const planCashSign = (
  section: string,
  value: number,
  canonicalKey?: string | null,
): number => {
  if (section === "INGRESOS") return value;
  if (section === "FINANCIAMIENTO") {
    return normalizeFinancingPlanAmount(section, value, canonicalKey);
  }
  return -value;
};

/** Signo cash de la sección para montos de comprometido (magnitud → cash). */
export const sectionCashSign = (section: string): 1 | -1 =>
  section === "INGRESOS" ? 1 : -1;

export function computeCellExecution(args: {
  section: string;
  plan: number;
  committedTotal: number;
  /** Σ items kind === "dte" (magnitud, ya neta de amountPaid). */
  committedNet: number;
  invoiced: boolean;
  realSigned: number;
  settlement: SettlementMode;
  residualCarryEnabled: boolean;
  residualMinClp: number;
  /** Para forzar signo − en RETIRO_SOCIO / FACTORING / DEVOL_*. */
  canonicalKey?: string | null;
}): { execution: CellExecution; committedNetCash: number; residual: number } {
  const {
    section,
    plan,
    committedTotal,
    committedNet,
    invoiced,
    realSigned,
    settlement,
    residualCarryEnabled,
    residualMinClp,
    canonicalKey,
  } = args;

  const sign = sectionCashSign(section);
  const committedGross = committedTotal - committedNet;

  let projGrossCash: number;
  let committedNetCash: number;
  if (plan !== 0 && !invoiced) {
    projGrossCash = planCashSign(section, plan, canonicalKey);
    committedNetCash = 0;
  } else {
    projGrossCash = sign * committedGross;
    committedNetCash = sign * committedNet;
  }

  const s = Math.sign(projGrossCash);
  const projAbs = Math.abs(projGrossCash);
  const executed = realSigned * s; // magnitud en dirección del proyectado (puede ser negativa)
  let residual =
    s === 0 ? 0 : s * Math.min(projAbs, Math.max(0, projAbs - executed));

  // Tolerancia solo con ejecución real: no anula proyecciones pequeñas sin movimiento.
  if (realSigned !== 0 && Math.abs(residual) <= residualMinClp) residual = 0;
  if (settlement === "CLOSED") residual = 0;

  // Legado: el real reemplaza la proyección (y el neto de facturas).
  if (!residualCarryEnabled) {
    if (realSigned !== 0) {
      residual = 0;
      committedNetCash = 0;
    } else {
      residual = projGrossCash;
    }
  }

  // Normalizar -0 → 0 (Object.is / vitest).
  residual = Math.round(residual) || 0;
  committedNetCash = Math.round(committedNetCash) || 0;

  const realMagInDir = s === 0 ? Math.abs(realSigned) : Math.max(0, executed);
  const overMag =
    s === 0 || projAbs === 0 ? 0 : Math.max(0, Math.round(executed - projAbs));
  const projectedMag = Math.round(projAbs);
  const realMag = Math.round(realMagInDir);
  const pct =
    projectedMag === 0 ? null : (realMag / projectedMag) * 100;

  let state: CellExecution["state"] = "none";
  if (settlement === "CLOSED" && projectedMag > 0) {
    state = "closed";
  } else if (projectedMag === 0) {
    state = "none";
  } else if (overMag > 0) {
    state = "over";
  } else if (Math.abs(residual) > 0 && realSigned !== 0) {
    state = "partial";
  } else if (projectedMag > 0 && (realSigned !== 0 || Math.abs(residual) === 0)) {
    // Completo: ejecutó todo, o tolerancia lo dio por cumplido, o sin real
    // pero residual ya anulado (CLOSED / tolerancia con real≈proy).
    state =
      realSigned !== 0 && Math.abs(residual) === 0 && overMag === 0
        ? "complete"
        : realSigned === 0
          ? "none"
          : "complete";
  }

  // Refinar state cuando no hay real y hay proyección viva: no es "ejecución".
  if (realSigned === 0 && settlement !== "CLOSED") {
    state = "none";
  }

  const execution: CellExecution = {
    projected: projectedMag,
    real: realMag,
    residual,
    over: overMag,
    pct,
    state,
    settlement,
  };

  return { execution, committedNetCash, residual };
}
