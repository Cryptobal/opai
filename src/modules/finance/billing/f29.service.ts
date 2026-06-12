/**
 * F29 / Libro IVA — cálculo canónico del período tributario.
 *
 * Única fuente de verdad para:
 *   - API /api/finance/billing/iva-summary (página Libro IVA)
 *   - Generador de cashflow iva-f29-sync (proyección del pago F29)
 *
 * Reglas SII implementadas (Registro de Compras y Ventas):
 *
 *   VENTAS (direction=ISSUED, siiStatus ACCEPTED|PENDING|SENT):
 *     33 factura afecta      → +débito
 *     34 factura exenta      → sin IVA (suma exento, base PPM)
 *     39/41 boletas          → +débito
 *     56 nota de débito      → +débito
 *     61 nota de crédito     → −débito
 *
 *   COMPRAS (direction=RECEIVED, excluye receptionStatus=CLAIMED):
 *     33 factura afecta      → +crédito
 *     34 factura exenta      → sin IVA (informativa)
 *     46 factura de compra   → +crédito
 *     56 nota de débito      → +crédito
 *     61 nota de crédito     → −crédito  ← antes se SUMABA (bug)
 *     52 guía de despacho    → EXCLUIDA del libro (no da crédito)
 *
 *   F29:
 *     remanente anterior     → arrastre UTM-ajustado (art. 23 N°2 Ley IVA),
 *                              encadenado hasta 24 meses hacia atrás.
 *     IVA determinado        = débito − crédito − remanente anterior
 *     PPM                    = tasa configurada × ingresos brutos del giro
 *                              (neto + exento de ventas, menos NC)
 *     Total a pagar          = max(0, IVA determinado) + PPM
 */

import { prisma } from "@/lib/prisma";

/** Tipos DTE de venta que generan débito fiscal (con signo). */
const VENTA_DEBITO: Record<number, 1 | -1> = {
  33: 1,
  39: 1,
  41: 1,
  56: 1,
  61: -1,
};

/** Tipos DTE de compra que afectan crédito fiscal (con signo). */
const COMPRA_CREDITO: Record<number, 1 | -1> = {
  33: 1,
  46: 1,
  56: 1,
  61: -1,
};

/** Tipos de venta que componen la base de ingresos brutos (PPM). */
const VENTA_TIPOS_LIBRO = new Set([33, 34, 39, 41, 56, 61]);

/** Tipos de compra que aparecen en el libro (34 informativa, sin crédito). */
const COMPRA_TIPOS_LIBRO = new Set([33, 34, 46, 56, 61]);

const ISSUED_SII_STATUS = ["ACCEPTED", "PENDING", "SENT"] as const;

/** Meses hacia atrás para encadenar el remanente de crédito fiscal. */
const REMANENTE_LOOKBACK_MONTHS = 24;

export interface F29Documento {
  id: string;
  direction: "ISSUED" | "RECEIVED";
  dteType: number;
  folio: number;
  date: string;
  rut: string;
  name: string;
  netAmount: number;
  exemptAmount: number;
  taxAmount: number;
  totalAmount: number;
  siiStatus: string;
  /** Signo con que el doc entra al libro: 1 suma, -1 resta (NC), 0 informativo. */
  sign: 1 | -1 | 0;
}

export interface F29PeriodResult {
  periodo: string;
  ventas: {
    facturasCount: number;
    exentasCount: number;
    notasCreditoCount: number;
    notasDebitoCount: number;
    ventaNeto: number;
    ventaExento: number;
    ventaIva: number;
    ncNeto: number;
    ncIva: number;
    ndNeto: number;
    ndIva: number;
    debitoFiscal: number;
  };
  compras: {
    count: number;
    exentasCount: number;
    notasCreditoCount: number;
    notasDebitoCount: number;
    compraNeto: number;
    compraExento: number;
    compraIva: number;
    ncNeto: number;
    ncIva: number;
    ndIva: number;
    creditoFiscal: number;
  };
  f29: {
    debitoFiscal: number;
    creditoFiscal: number;
    /** Remanente de crédito fiscal del período anterior (CLP, UTM-ajustado). */
    remanenteAnterior: number;
    /** débito − crédito − remanente. Negativo = saldo a favor. */
    ivaDeterminado: number;
    ppmBase: number;
    ppmRatePct: number;
    ppmMonto: number;
    /** max(0, ivaDeterminado) + PPM. Lo que efectivamente se paga. */
    totalAPagar: number;
    esIvaAFavor: boolean;
    /** Remanente que queda para el período siguiente (si ivaDeterminado < 0). */
    remanenteSiguiente: number;
  };
  documentos: F29Documento[];
}

interface LeanDte {
  id: string;
  direction: "ISSUED" | "RECEIVED";
  dteType: number;
  folio: number;
  date: Date;
  issuerRut: string;
  issuerName: string;
  receiverRut: string;
  receiverName: string;
  netAmount: { toNumber(): number };
  exemptAmount: { toNumber(): number };
  taxAmount: { toNumber(): number };
  totalAmount: { toNumber(): number };
  siiStatus: string;
  receptionStatus: string | null;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** ¿El doc cuenta para el libro del período? (filtros de estado + tipo). */
function isLibroVenta(d: LeanDte): boolean {
  return (
    d.direction === "ISSUED" &&
    VENTA_TIPOS_LIBRO.has(d.dteType) &&
    (ISSUED_SII_STATUS as readonly string[]).includes(d.siiStatus)
  );
}

function isLibroCompra(d: LeanDte): boolean {
  return (
    d.direction === "RECEIVED" &&
    COMPRA_TIPOS_LIBRO.has(d.dteType) &&
    d.receptionStatus !== "CLAIMED"
  );
}

/** Débito fiscal del set de docs de un mes (ya filtrados como venta). */
function debitoOf(docs: LeanDte[]): number {
  return docs.reduce((acc, d) => {
    const sign = VENTA_DEBITO[d.dteType] ?? 0;
    return acc + sign * d.taxAmount.toNumber();
  }, 0);
}

/** Crédito fiscal del set de docs de un mes (ya filtrados como compra). */
function creditoOf(docs: LeanDte[]): number {
  return docs.reduce((acc, d) => {
    const sign = COMPRA_CREDITO[d.dteType] ?? 0;
    return acc + sign * d.taxAmount.toNumber();
  }, 0);
}

/**
 * Encadena el remanente de crédito fiscal mes a mes hasta el período
 * objetivo. El arrastre se reajusta por UTM (se expresa en UTM al mes en
 * que se genera y se reconvierte a CLP al mes siguiente). Sin UTM para
 * algún mes, el arrastre va en CLP nominal (aprox. conservadora).
 */
function chainRemanente(
  byMonth: Map<string, { debito: number; credito: number }>,
  utmByMonth: Map<string, number>,
  months: string[],
  targetPeriodo: string,
): number {
  let remanente = 0;
  let prevMonth: string | null = null;
  for (const m of months) {
    if (m >= targetPeriodo) break;
    // Reajuste UTM del arrastre que viene del mes anterior.
    if (remanente > 0 && prevMonth) {
      const utmPrev = utmByMonth.get(prevMonth);
      const utmCur = utmByMonth.get(m);
      if (utmPrev && utmCur && utmPrev > 0) {
        remanente = Math.round((remanente / utmPrev) * utmCur);
      }
    }
    const sums = byMonth.get(m) ?? { debito: 0, credito: 0 };
    const determinado = sums.debito - sums.credito - remanente;
    remanente = determinado < 0 ? -determinado : 0;
    prevMonth = m;
  }
  // Reajuste final hacia el período objetivo.
  if (remanente > 0 && prevMonth) {
    const utmPrev = utmByMonth.get(prevMonth);
    const utmCur = utmByMonth.get(targetPeriodo);
    if (utmPrev && utmCur && utmPrev > 0) {
      remanente = Math.round((remanente / utmPrev) * utmCur);
    }
  }
  return remanente;
}

/**
 * Calcula el F29 completo de un período YYYY-MM para un tenant.
 * Lee FinanceDte por fecha tributaria (`date`), nunca `createdAt`.
 */
export async function computeF29Period(
  tenantId: string,
  periodo: string,
): Promise<F29PeriodResult> {
  const [year, month] = periodo.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const lookbackStart = new Date(
    Date.UTC(year, month - 1 - REMANENTE_LOOKBACK_MONTHS, 1),
  );

  const [dtes, utmRates, config] = await Promise.all([
    prisma.financeDte.findMany({
      where: {
        tenantId,
        date: { gte: lookbackStart, lt: end },
        siiStatus: { in: [...ISSUED_SII_STATUS] },
      },
      select: {
        id: true,
        direction: true,
        dteType: true,
        folio: true,
        date: true,
        issuerRut: true,
        issuerName: true,
        receiverRut: true,
        receiverName: true,
        netAmount: true,
        exemptAmount: true,
        taxAmount: true,
        totalAmount: true,
        siiStatus: true,
        receptionStatus: true,
      },
      orderBy: [{ direction: "asc" }, { date: "asc" }, { folio: "asc" }],
    }),
    prisma.fxUtmRate.findMany({
      where: { month: { gte: lookbackStart, lte: start } },
      select: { month: true, value: true },
    }),
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: { ppmRatePct: true },
    }),
  ]);

  const all = dtes as unknown as LeanDte[];

  // ── Remanente: agrupar débito/crédito por mes anterior al período ──
  const byMonth = new Map<string, { debito: number; credito: number }>();
  for (const d of all) {
    const key = monthKey(d.date);
    if (key >= periodo) continue;
    if (!byMonth.has(key)) byMonth.set(key, { debito: 0, credito: 0 });
    const slot = byMonth.get(key)!;
    if (isLibroVenta(d)) slot.debito += (VENTA_DEBITO[d.dteType] ?? 0) * d.taxAmount.toNumber();
    else if (isLibroCompra(d)) slot.credito += (COMPRA_CREDITO[d.dteType] ?? 0) * d.taxAmount.toNumber();
  }
  const utmByMonth = new Map<string, number>(
    utmRates.map((r) => [monthKey(r.month), Number(r.value)]),
  );
  const monthsSorted = [...byMonth.keys()].sort();
  const remanenteAnterior = Math.round(
    chainRemanente(byMonth, utmByMonth, monthsSorted, periodo),
  );

  // ── Documentos del período ──
  const periodDocs = all.filter((d) => d.date >= start && d.date < end);
  const ventas = periodDocs.filter(isLibroVenta);
  const compras = periodDocs.filter(isLibroCompra);

  const sum = (rows: LeanDte[], f: "netAmount" | "exemptAmount" | "taxAmount") =>
    rows.reduce((acc, r) => acc + r[f].toNumber(), 0);

  const vFacturas = ventas.filter((d) => [33, 39, 41].includes(d.dteType));
  const vExentas = ventas.filter((d) => d.dteType === 34);
  const vNc = ventas.filter((d) => d.dteType === 61);
  const vNd = ventas.filter((d) => d.dteType === 56);

  const cFacturas = compras.filter((d) => [33, 46].includes(d.dteType));
  const cExentas = compras.filter((d) => d.dteType === 34);
  const cNc = compras.filter((d) => d.dteType === 61);
  const cNd = compras.filter((d) => d.dteType === 56);

  const ventaIva = sum(vFacturas, "taxAmount");
  const ncIva = sum(vNc, "taxAmount");
  const ndIva = sum(vNd, "taxAmount");
  const debitoFiscal = ventaIva + ndIva - ncIva;

  const compraIva = sum(cFacturas, "taxAmount");
  const cNcIva = sum(cNc, "taxAmount");
  const cNdIva = sum(cNd, "taxAmount");
  const creditoFiscal = compraIva + cNdIva - cNcIva;

  const ivaDeterminado = debitoFiscal - creditoFiscal - remanenteAnterior;

  // ── PPM: ingresos brutos del giro = neto + exento de ventas, menos NC ──
  const ppmRatePct = Number(config?.ppmRatePct ?? 0);
  const ppmBase = Math.max(
    0,
    sum(vFacturas, "netAmount") +
      sum(vFacturas, "exemptAmount") +
      sum(vExentas, "netAmount") +
      sum(vExentas, "exemptAmount") +
      sum(vNd, "netAmount") +
      sum(vNd, "exemptAmount") -
      sum(vNc, "netAmount") -
      sum(vNc, "exemptAmount"),
  );
  const ppmMonto = Math.round(ppmBase * (ppmRatePct / 100));

  const totalAPagar = Math.max(0, ivaDeterminado) + ppmMonto;

  const docSign = (d: LeanDte): 1 | -1 | 0 => {
    if (d.direction === "ISSUED") return VENTA_DEBITO[d.dteType] ?? 0;
    return COMPRA_CREDITO[d.dteType] ?? 0;
  };

  return {
    periodo,
    ventas: {
      facturasCount: vFacturas.length,
      exentasCount: vExentas.length,
      notasCreditoCount: vNc.length,
      notasDebitoCount: vNd.length,
      ventaNeto: sum(vFacturas, "netAmount"),
      ventaExento: sum(vFacturas, "exemptAmount") + sum(vExentas, "exemptAmount") + sum(vExentas, "netAmount"),
      ventaIva,
      ncNeto: sum(vNc, "netAmount"),
      ncIva,
      ndNeto: sum(vNd, "netAmount"),
      ndIva,
      debitoFiscal,
    },
    compras: {
      count: cFacturas.length,
      exentasCount: cExentas.length,
      notasCreditoCount: cNc.length,
      notasDebitoCount: cNd.length,
      compraNeto: sum(cFacturas, "netAmount"),
      compraExento: sum(cFacturas, "exemptAmount") + sum(cExentas, "exemptAmount") + sum(cExentas, "netAmount"),
      compraIva,
      ncNeto: sum(cNc, "netAmount"),
      ncIva: cNcIva,
      ndIva: cNdIva,
      creditoFiscal,
    },
    f29: {
      debitoFiscal,
      creditoFiscal,
      remanenteAnterior,
      ivaDeterminado,
      ppmBase,
      ppmRatePct,
      ppmMonto,
      totalAPagar,
      esIvaAFavor: ivaDeterminado < 0,
      remanenteSiguiente: ivaDeterminado < 0 ? -ivaDeterminado : 0,
    },
    documentos: [...ventas, ...compras].map((d) => ({
      id: d.id,
      direction: d.direction,
      dteType: d.dteType,
      folio: d.folio,
      date: d.date.toISOString().split("T")[0],
      rut: d.direction === "ISSUED" ? d.receiverRut : d.issuerRut,
      name: d.direction === "ISSUED" ? d.receiverName : d.issuerName,
      netAmount: d.netAmount.toNumber(),
      exemptAmount: d.exemptAmount.toNumber(),
      taxAmount: d.taxAmount.toNumber(),
      totalAmount: d.totalAmount.toNumber(),
      siiStatus: d.siiStatus,
      sign: docSign(d),
    })),
  };
}
