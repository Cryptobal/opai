/**
 * Totales de facturación del bundle a partir de sus hijas (client-side, solo
 * display): mensual cliente = Σ salePriceMonthly (CLP, ya incluye líneas
 * mensuales con margen — misma fórmula del motor) y pagos únicos = Σ líneas
 * `unico` con su margen. No duplica montos en el bundle (§12 del brief).
 */

import type { BundleDetail, BundleMember } from "@/components/cpq/bundle/useBundle";

const toNum = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Precio de venta de una línea (con su margen propio) — espejo del motor. */
export function lineSellPrice(line: {
  precio: number | string;
  cantidad: number;
  marginPct: number | string | null;
}): number {
  const base = toNum(line.precio) * (line.cantidad || 1);
  const m = toNum(line.marginPct);
  return m > 0 && m < 100 ? base / (1 - m / 100) : base;
}

export type BundleBillingByQuote = {
  quoteId: string;
  installationName: string | null;
  code: string;
  monthlyClp: number;
  oneTimeClp: number;
  includedInProposal: boolean;
};

export type BundleBilling = {
  monthlyClp: number;
  oneTimeClp: number;
  byQuote: BundleBillingByQuote[];
};

export function memberMonthlyClp(m: BundleMember): number {
  return toNum(m.quote.parameters?.salePriceMonthly);
}

export function memberOneTimeClp(m: BundleMember): number {
  return (m.quote.additionalLines ?? [])
    .filter((l) => l.recurrencia === "unico")
    .reduce((sum, l) => sum + lineSellPrice(l), 0);
}

export function computeBundleBilling(bundle: BundleDetail): BundleBilling {
  const byQuote = bundle.quotes.map((m) => ({
    quoteId: m.quoteId,
    installationName: m.quote.installation?.name ?? null,
    code: m.quote.code,
    monthlyClp: memberMonthlyClp(m),
    oneTimeClp: memberOneTimeClp(m),
    includedInProposal: m.includedInProposal,
  }));
  const included = byQuote.filter((q) => q.includedInProposal);
  return {
    monthlyClp: included.reduce((s, q) => s + q.monthlyClp, 0),
    oneTimeClp: included.reduce((s, q) => s + q.oneTimeClp, 0),
    byQuote,
  };
}

export function fmtBundleMoney(
  clp: number,
  currency: string,
  ufValue: number | null,
): string {
  if (currency === "UF" && ufValue && ufValue > 0) {
    return `${(clp / ufValue).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
  }
  return `$${Math.round(clp).toLocaleString("es-CL")}`;
}
