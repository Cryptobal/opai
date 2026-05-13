/**
 * Types for the transparent cost breakdown panel.
 * Shared between CPQ internal view and client portal.
 */

export interface ResourceBreakdownItem {
  name: string;
  amount: number;
  quantity?: number;
  unit?: string;
  calcMode?: string;
  technicalSpecs?: string | null;
}

export interface ResourceBreakdownCategory {
  category: string;
  categoryType: "direct" | "indirect";
  items: ResourceBreakdownItem[];
  subtotal: number;
}

export interface PositionBreakdownItem {
  id: string;
  name: string;
  numGuards: number;
  numPuestos: number;
  /** Total guards working this position (numGuards × numPuestos) */
  totalGuardsInPosition: number;

  /** Mano de obra — totals for the position (already multiplied by totalGuardsInPosition) */
  baseSalary: number;
  gratification: number;
  totalImponible: number;
  sisEmployer: number;
  afcEmployer: number;
  mutualEmployer: number;
  vacationProvision: number;
  severanceProvision: number;
  /** = monthlyPositionCost from DB */
  totalLaborCost: number;

  /**
   * Sueldo líquido mensual estimado por guardia (motor nómina / columna netSalary).
   * Omitido o null si no hay dato.
   */
  netSalaryPerGuard?: number | null;

  /** Sale price for this position (with margin + financial allocated proportionally) */
  salePrice: number;
  /** Price per guard per hour: salePrice / (totalGuardsInPosition × monthlyHoursStandard) */
  hourlyRateSale: number;

  /** Agrupación opcional para render agrupado en PDF / portal. */
  serviceGroupId?: string | null;
  serviceGroupName?: string | null;
  serviceGroupPattern?: string | null;
  serviceGroupOrder?: number | null;
  serviceGroupIcon?: string | null;
}

export interface QuoteBreakdownData {
  positions: PositionBreakdownItem[];

  /* ── Labor ── */
  totalLaborCost: number;
  holidayAdjustment: number;

  /* ── Direct costs ── */
  uniforms: number;
  exams: number;
  meals: number;

  /* ── Indirect costs ── */
  vehicles: number;
  infrastructure: number;
  equipment: number;
  transport: number;
  systems: number;
  other: number;

  /* ── Subtotal & pricing ── */
  subtotalBase: number;
  marginPct: number;
  marginAmount: number;
  financial: number;
  financialRatePct: number;
  policy: number;
  policyRatePct: number;

  /** Sale price without additional lines */
  totalSalePrice: number;
  /** Additional lines total (pass-through, no margin) */
  additionalLines: number;
  /** Grand total = totalSalePrice + additionalLines */
  grandTotal: number;

  /* ── Config ── */
  monthlyHoursStandard: number;
  currency: string;
  ufValue?: number;
}
