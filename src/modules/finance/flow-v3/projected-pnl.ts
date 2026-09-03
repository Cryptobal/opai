/**
 * Estado de resultados operativo proyectado (puro).
 *
 * Distinto del flujo de caja: acá el mes es de DEVENGADO (billingPeriod /
 * fecha del documento / mes de servicio), no de cobro ni de pago. Distinto
 * del EERR de Informes: no lee asientos POSTED; proyecta con DTEs,
 * programaciones, costo de personal operativo por instalación, GAV (equipo
 * interno + recurrencias + compras sin faena) y run-rate de TE/compras en
 * meses abiertos.
 */

/** Meses calendario cerrados usados para proyectar TE y compras futuras. */
export const RUN_RATE_LOOKBACK_MONTHS = 3;

export const UNASSIGNED_INSTALLATION = "__unassigned__";

const MONTH_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const ISSUED_PLUS = new Set([33, 34, 39, 41, 56]);
const RECEIVED_PLUS = new Set([33, 34, 46, 56]);
const CREDIT_NOTE = 61;

export interface PnlMonthColumn {
  key: string;
  label: string;
  isCurrent: boolean;
  isPast: boolean;
}

export interface PnlLineSeries {
  revenue: number[];
  personnel: number[];
  extraShifts: number[];
  directCost: number[];
  gav: number[];
  result: number[];
}

export interface PnlLineTotals {
  revenue: number;
  personnel: number;
  extraShifts: number;
  directCost: number;
  gav: number;
  result: number;
  marginPct: number;
}

export interface ProjectedPnlInstallationRow {
  installationId: string;
  name: string;
  totals: PnlLineTotals;
  monthly: PnlLineSeries;
}

export interface ProjectedPnlResult {
  months: PnlMonthColumn[];
  company: PnlLineSeries & { totals: PnlLineTotals };
  installations: ProjectedPnlInstallationRow[];
  unassigned: PnlLineTotals | null;
  allocationMethod: "by_revenue";
}

export interface IssuedRevenueInput {
  dteType: number;
  netAmount: number;
  dateYmd: string;
  billingPeriod?: string | null;
  installationId?: string | null;
  recurringTemplateId?: string | null;
}

export interface TemplateProjectionInput {
  id: string;
  installationId?: string | null;
  /** Neto CLP por cuota (sin IVA). */
  netPerRunClp: number;
  /** Períodos YYYY-MM aún no cubiertos por un DTE emitido/borrador. */
  periods: string[];
}

export interface PersonnelInput {
  installationId: string;
  name: string | null;
  /** Costo directo mensual (líquido + previred + impuesto único). */
  monthlyCostClp: number;
}

export interface ExtraShiftInput {
  installationId: string;
  dateYmd: string;
  amountClp: number;
}

export interface ReceivedCostInput {
  dteType: number;
  netAmount: number;
  dateYmd: string;
  installationId?: string | null;
}

export interface GavRecurrenceInput {
  monthKey: string;
  amountClp: number;
}

export interface AssembleProjectedPnlArgs {
  months: PnlMonthColumn[];
  issued: IssuedRevenueInput[];
  templates: TemplateProjectionInput[];
  personnel: PersonnelInput[];
  extraShifts: ExtraShiftInput[];
  received: ReceivedCostInput[];
  gavRecurrences: GavRecurrenceInput[];
  installationNames?: Map<string, string>;
}

function zeros(n: number): number[] {
  return Array.from({ length: n }, () => 0);
}

function sumArr(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function monthIndex(months: PnlMonthColumn[], key: string): number {
  return months.findIndex((m) => m.key === key);
}

/** Meses calendario inclusivos entre dos YMD (máx. 36). */
export function enumerateMonthKeys(fromYmd: string, toYmd: string): string[] {
  const from = fromYmd.slice(0, 7);
  const to = toYmd.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to) || from > to) {
    return [];
  }
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  for (let i = 0; i < 36; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (y === ty && m === tm) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function monthLabel(key: string): string {
  const [ys, ms] = key.split("-");
  const m = Number(ms);
  if (!ys || !Number.isFinite(m) || m < 1 || m > 12) return key;
  return `${MONTH_SHORT[m - 1]} ${ys}`;
}

/** Primer día UTC del mes `YYYY-MM`. Inválido → epoch 0. */
export function monthKeyStartUtc(monthKey: string): Date {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return new Date(0);
  return new Date(`${monthKey}-01T00:00:00.000Z`);
}

/**
 * Últimos `count` meses calendario ya cerrados respecto de `todayYmd`
 * (el mes en curso no entra). Orden cronológico.
 */
export function completeMonthKeysBefore(todayYmd: string, count: number): string[] {
  if (count <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(todayYmd)) return [];
  let y = Number(todayYmd.slice(0, 4));
  let m = Number(todayYmd.slice(5, 7)) - 1;
  if (!Number.isFinite(y) || !Number.isFinite(m)) return [];
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out.reverse();
}

/** Promedio mensual (ceros incluidos). Sin meses → 0. */
export function monthlyRunRate(
  amountsByMonth: Map<string, number> | undefined,
  monthKeys: string[],
): number {
  if (monthKeys.length === 0) return 0;
  let sum = 0;
  for (const k of monthKeys) sum += amountsByMonth?.get(k) ?? 0;
  return Math.round(sum / monthKeys.length);
}

export interface RunRateActual {
  key: string;
  monthKey: string;
  amount: number;
}

/**
 * Completa meses abiertos (actual y futuros) con el promedio de meses
 * cerrados. Si el mes ya tiene real, solo rellena el gap (`rate − actual`).
 * Meses pasados no se tocan.
 */
export function gapFillOpenMonths<T>(args: {
  months: PnlMonthColumn[];
  rateMonthKeys: string[];
  actuals: RunRateActual[];
  toItem: (key: string, monthKey: string, amount: number) => T;
}): T[] {
  const byKey = new Map<string, Map<string, number>>();
  for (const a of args.actuals) {
    if (!a.key || a.amount === 0) continue;
    let byMonth = byKey.get(a.key);
    if (!byMonth) {
      byMonth = new Map();
      byKey.set(a.key, byMonth);
    }
    byMonth.set(a.monthKey, (byMonth.get(a.monthKey) ?? 0) + a.amount);
  }
  const open = args.months.filter((m) => !m.isPast);
  const out: T[] = [];
  for (const [key, byMonth] of byKey) {
    const rate = monthlyRunRate(byMonth, args.rateMonthKeys);
    if (rate <= 0) continue;
    for (const m of open) {
      const actual = byMonth.get(m.key) ?? 0;
      const gap = rate - actual;
      if (gap > 0) out.push(args.toItem(key, m.key, gap));
    }
  }
  return out;
}

export function buildMonthColumns(
  keys: string[],
  todayYmd: string,
): PnlMonthColumn[] {
  const current = todayYmd.slice(0, 7);
  return keys.map((key) => ({
    key,
    label: monthLabel(key),
    isCurrent: key === current,
    isPast: key < current,
  }));
}

/**
 * Mes de reconocimiento: `billingPeriod` (YYYY-MM) manda sobre la fecha
 * de emisión/cobro. Así una factura emitida en julio por el servicio de
 * junio entra en junio.
 */
export function recognitionMonthKey(
  billingPeriod: string | null | undefined,
  dateYmd: string,
): string {
  if (billingPeriod && /^\d{4}-\d{2}$/.test(billingPeriod)) return billingPeriod;
  return dateYmd.slice(0, 7);
}

/** Neto signado. Notas de crédito restan. Tipos fuera de lista → 0. */
export function signedDocumentNet(
  dteType: number,
  netAmount: number,
  direction: "ISSUED" | "RECEIVED",
): number {
  const n = Number.isFinite(netAmount) ? netAmount : 0;
  if (dteType === CREDIT_NOTE) return -n;
  const plus = direction === "ISSUED" ? ISSUED_PLUS : RECEIVED_PLUS;
  if (plus.has(dteType)) return n;
  return 0;
}

/**
 * Neto CLP de líneas de programación (sin IVA). UF→CLP con `ufValue`.
 * Misma aritmética de cantidad/descuento que `grossPerRunFromLines`,
 * pero el resultado es neto (P&L, no caja).
 */
export function netPerRunFromLines(
  rawLines: unknown,
  templateCurrency: string,
  ufValue: number | null,
): number {
  const lines = (rawLines as Array<{
    quantity?: number | string;
    unitPrice?: number | string;
    unitPriceUf?: number | string;
    discountPct?: number | string;
    priceCurrency?: "CLP" | "UF";
  }> | null) ?? [];
  let total = 0;
  for (const l of lines) {
    const linePc =
      l.priceCurrency === "UF" || l.priceCurrency === "CLP"
        ? l.priceCurrency
        : templateCurrency === "UF" || l.unitPriceUf != null
          ? "UF"
          : "CLP";
    const qty = Number(l.quantity ?? 1);
    const disc = Number(l.discountPct ?? 0) / 100;
    const unit =
      linePc === "UF"
        ? Number(l.unitPriceUf ?? 0) * (ufValue ?? 0)
        : Number(l.unitPrice ?? 0);
    if (!Number.isFinite(qty) || !Number.isFinite(unit) || !Number.isFinite(disc)) {
      continue;
    }
    total += qty * unit * (1 - disc);
  }
  return Math.round(total);
}

function instKey(id: string | null | undefined): string {
  return id && id.length > 0 ? id : UNASSIGNED_INSTALLATION;
}

function addAt(
  map: Map<string, number[]>,
  id: string,
  idx: number,
  len: number,
  amount: number,
): void {
  if (idx < 0 || amount === 0) return;
  let row = map.get(id);
  if (!row) {
    row = zeros(len);
    map.set(id, row);
  }
  row[idx] += amount;
}

function seriesOf(
  revenue: number[],
  personnel: number[],
  extraShifts: number[],
  directCost: number[],
  gav: number[],
): PnlLineSeries {
  const result = revenue.map(
    (r, i) => r - (personnel[i] ?? 0) - (extraShifts[i] ?? 0) - (directCost[i] ?? 0) - (gav[i] ?? 0),
  );
  return { revenue, personnel, extraShifts, directCost, gav, result };
}

function totalsOf(s: PnlLineSeries): PnlLineTotals {
  const revenue = sumArr(s.revenue);
  const personnel = sumArr(s.personnel);
  const extraShifts = sumArr(s.extraShifts);
  const directCost = sumArr(s.directCost);
  const gav = sumArr(s.gav);
  const result = revenue - personnel - extraShifts - directCost - gav;
  return {
    revenue,
    personnel,
    extraShifts,
    directCost,
    gav,
    result,
    marginPct: revenue ? Number(((result / revenue) * 100).toFixed(1)) : 0,
  };
}

/**
 * Prorratea GAV de cada mes según la participación de ingresos de cada
 * instalación ese mes. Si nadie factura, el GAV no se atribuye (queda
 * solo en la vista Empresa). El residuo de redondeo va a la instalación
 * de mayor ingreso del mes.
 */
export function allocateGavByRevenue(
  gavByMonth: number[],
  revenueByInst: Map<string, number[]>,
): Map<string, number[]> {
  const ids = [...revenueByInst.keys()].filter((id) => id !== UNASSIGNED_INSTALLATION);
  const out = new Map<string, number[]>();
  for (const id of ids) out.set(id, zeros(gavByMonth.length));
  for (let i = 0; i < gavByMonth.length; i++) {
    const gav = gavByMonth[i] ?? 0;
    if (gav === 0 || ids.length === 0) continue;
    const weights = ids.map((id) => Math.max(0, revenueByInst.get(id)?.[i] ?? 0));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    let assigned = 0;
    let bestIdx = 0;
    for (let j = 0; j < ids.length; j++) {
      if (weights[j] > weights[bestIdx]) bestIdx = j;
      const share = Math.round((gav * weights[j]) / total);
      out.get(ids[j])![i] = share;
      assigned += share;
    }
    const delta = gav - assigned;
    if (delta !== 0) {
      out.get(ids[bestIdx])![i] += delta;
    }
  }
  return out;
}

function mergeIds(...maps: Array<Map<string, unknown>>): string[] {
  const s = new Set<string>();
  for (const m of maps) for (const k of m.keys()) s.add(k);
  return [...s];
}

export function assembleProjectedPnl(args: AssembleProjectedPnlArgs): ProjectedPnlResult {
  const n = args.months.length;
  const revenue = new Map<string, number[]>();
  const personnel = new Map<string, number[]>();
  const extraShifts = new Map<string, number[]>();
  const directCost = new Map<string, number[]>();
  const gavCompany = zeros(n);
  const names = new Map<string, string>(args.installationNames ?? []);

  for (const d of args.issued) {
    const key = recognitionMonthKey(d.billingPeriod, d.dateYmd);
    const idx = monthIndex(args.months, key);
    const signed = signedDocumentNet(d.dteType, d.netAmount, "ISSUED");
    addAt(revenue, instKey(d.installationId), idx, n, signed);
  }

  for (const t of args.templates) {
    if (t.netPerRunClp <= 0) continue;
    const id = instKey(t.installationId);
    for (const period of t.periods) {
      addAt(revenue, id, monthIndex(args.months, period), n, t.netPerRunClp);
    }
  }

  for (const p of args.personnel) {
    if (p.name) names.set(p.installationId, p.name);
    const row = zeros(n);
    for (let i = 0; i < n; i++) row[i] = p.monthlyCostClp;
    personnel.set(p.installationId, row);
  }

  for (const te of args.extraShifts) {
    const idx = monthIndex(args.months, te.dateYmd.slice(0, 7));
    addAt(extraShifts, instKey(te.installationId), idx, n, te.amountClp);
  }

  for (const r of args.received) {
    const idx = monthIndex(args.months, r.dateYmd.slice(0, 7));
    const signed = signedDocumentNet(r.dteType, r.netAmount, "RECEIVED");
    if (r.installationId) {
      addAt(directCost, r.installationId, idx, n, signed);
    } else {
      if (idx >= 0) gavCompany[idx] += signed;
    }
  }

  for (const g of args.gavRecurrences) {
    const idx = monthIndex(args.months, g.monthKey);
    if (idx >= 0) gavCompany[idx] += g.amountClp;
  }

  const allocated = allocateGavByRevenue(gavCompany, revenue);

  const sumMaps = (...maps: Array<Map<string, number[]>>): number[] => {
    const out = zeros(n);
    for (const map of maps) {
      for (const row of map.values()) {
        for (let i = 0; i < n; i++) out[i] += row[i] ?? 0;
      }
    }
    return out;
  };

  const companyRevenue = sumMaps(revenue);
  const companyPersonnel = sumMaps(personnel);
  const companyExtra = sumMaps(extraShifts);
  const companyDirect = sumMaps(directCost);
  const companySeries = seriesOf(
    companyRevenue,
    companyPersonnel,
    companyExtra,
    companyDirect,
    gavCompany,
  );

  const unassignedRev = revenue.get(UNASSIGNED_INSTALLATION) ?? zeros(n);
  const unassignedExtra = extraShifts.get(UNASSIGNED_INSTALLATION) ?? zeros(n);
  const unassignedDirect = directCost.get(UNASSIGNED_INSTALLATION) ?? zeros(n);
  const unassignedSeries = seriesOf(
    unassignedRev,
    zeros(n),
    unassignedExtra,
    unassignedDirect,
    zeros(n),
  );
  const unassignedTotals = totalsOf(unassignedSeries);
  const hasUnassigned =
    unassignedTotals.revenue !== 0 ||
    unassignedTotals.extraShifts !== 0 ||
    unassignedTotals.directCost !== 0;

  const ids = mergeIds(revenue, personnel, extraShifts, directCost).filter(
    (id) => id !== UNASSIGNED_INSTALLATION,
  );
  const installations: ProjectedPnlInstallationRow[] = ids.map((id) => {
    const monthly = seriesOf(
      revenue.get(id) ?? zeros(n),
      personnel.get(id) ?? zeros(n),
      extraShifts.get(id) ?? zeros(n),
      directCost.get(id) ?? zeros(n),
      allocated.get(id) ?? zeros(n),
    );
    return {
      installationId: id,
      name: names.get(id) ?? "Instalación",
      totals: totalsOf(monthly),
      monthly,
    };
  });
  installations.sort((a, b) => b.totals.result - a.totals.result);

  return {
    months: args.months,
    company: { ...companySeries, totals: totalsOf(companySeries) },
    installations,
    unassigned: hasUnassigned ? unassignedTotals : null,
    allocationMethod: "by_revenue",
  };
}

/** Períodos de un template ya cubiertos por un DTE (emitido o borrador). */
export function coveredPeriodKey(templateId: string, billingPeriod: string): string {
  return `${templateId}::${billingPeriod}`;
}
