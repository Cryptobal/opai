/**
 * Propagación de condiciones comerciales y gasto financiero del bundle a sus
 * cotizaciones hijas. Fuente de verdad: campos del CpqProposalBundle (null =
 * campo aún no gobernado por el bundle → no se toca en las hijas).
 *
 * Escritura transaccional (condiciones + parameters) y recálculo estándar por
 * cotización (refreshQuoteTotals) después del commit, igual que el resto del
 * CPQ. Toda query filtra por tenantId.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { refreshQuoteTotals } from "@/modules/cpq/costing/compute-quote-costs";
import { BundleServiceError } from "./bundle.service";

type DecimalLike = number | string | Prisma.Decimal;

/** Campos de condiciones del bundle que se copian 1:1 a CpqQuote. */
export const BUNDLE_CONDITION_FIELDS = [
  "paymentTerms",
  "serviceStartDays",
  "contractDuration",
  "isOngoingService",
  "adjustmentType",
  "adjustmentFreq",
  "ipcWeight",
  "imoWeight",
  "insurancePolicyUF",
  "liabilityMonths",
  "realAnnualIncrement",
  "paymentDays",
  "paymentDayMode",
] as const;

export type BundleConditionField = (typeof BUNDLE_CONDITION_FIELDS)[number];

type BundleConditionsSource = Partial<Record<BundleConditionField, unknown>> & {
  currency?: string | null;
  validUntil?: Date | null;
  financialEnabled?: boolean | null;
  financialRatePct?: DecimalLike | null;
  adjustmentType?: unknown;
};

/**
 * Construye los `data` de Prisma para quote y parameters a partir del bundle.
 * Solo campos NO nulos (null = no gobernado). Excepciones:
 * - `currency` se propaga siempre (invariante de moneda única del bundle).
 * - `adjustmentFreq` sí admite null cuando el tipo de reajuste es NONE.
 */
export function buildQuoteConditionData(bundle: BundleConditionsSource): {
  quoteData: Record<string, unknown>;
  parametersData: { financialEnabled?: boolean; financialRatePct?: DecimalLike };
} {
  const quoteData: Record<string, unknown> = {};
  for (const field of BUNDLE_CONDITION_FIELDS) {
    const value = bundle[field];
    if (value !== null && value !== undefined) quoteData[field] = value;
  }
  if (bundle.adjustmentType === "NONE") {
    quoteData.adjustmentFreq = null;
    quoteData.ipcWeight = null;
    quoteData.imoWeight = null;
  }
  if (bundle.currency) quoteData.currency = bundle.currency;
  if (bundle.validUntil !== null && bundle.validUntil !== undefined) {
    quoteData.validUntil = bundle.validUntil;
  }

  const parametersData: {
    financialEnabled?: boolean;
    financialRatePct?: DecimalLike;
  } = {};
  if (typeof bundle.financialEnabled === "boolean") {
    parametersData.financialEnabled = bundle.financialEnabled;
  }
  if (bundle.financialRatePct !== null && bundle.financialRatePct !== undefined) {
    parametersData.financialRatePct = bundle.financialRatePct;
  }

  return { quoteData, parametersData };
}

export async function propagateBundleConditions(opts: {
  tenantId: string;
  bundleId: string;
  /** Si se indica, propaga solo a estas hijas (p. ej. una recién agregada). */
  quoteIds?: string[] | null;
}): Promise<{ updatedQuoteIds: string[] }> {
  const bundle = await prisma.cpqProposalBundle.findFirst({
    where: { id: opts.bundleId, tenantId: opts.tenantId },
    select: {
      id: true,
      currency: true,
      validUntil: true,
      paymentTerms: true,
      serviceStartDays: true,
      contractDuration: true,
      isOngoingService: true,
      adjustmentType: true,
      adjustmentFreq: true,
      ipcWeight: true,
      imoWeight: true,
      insurancePolicyUF: true,
      liabilityMonths: true,
      realAnnualIncrement: true,
      paymentDays: true,
      paymentDayMode: true,
      financialEnabled: true,
      financialRatePct: true,
    },
  });
  if (!bundle) {
    throw new BundleServiceError("Propuesta no encontrada", "NOT_FOUND", 404);
  }

  const members = await prisma.cpqProposalBundleQuote.findMany({
    where: { tenantId: opts.tenantId, bundleId: opts.bundleId },
    select: { quoteId: true },
  });
  const allowed = new Set(members.map((m) => m.quoteId));
  const targetIds = (opts.quoteIds?.length
    ? opts.quoteIds.filter((id) => allowed.has(id))
    : Array.from(allowed));
  if (targetIds.length === 0) return { updatedQuoteIds: [] };

  const { quoteData, parametersData } = buildQuoteConditionData(bundle);
  const hasQuoteData = Object.keys(quoteData).length > 0;
  const hasParamsData = Object.keys(parametersData).length > 0;
  if (!hasQuoteData && !hasParamsData) return { updatedQuoteIds: [] };

  await prisma.$transaction(async (tx) => {
    if (hasQuoteData) {
      await tx.cpqQuote.updateMany({
        where: { id: { in: targetIds }, tenantId: opts.tenantId },
        data: quoteData,
      });
    }
    if (hasParamsData) {
      for (const quoteId of targetIds) {
        await tx.cpqQuoteParameters.upsert({
          where: { quoteId },
          update: parametersData,
          create: { quoteId, ...parametersData },
        });
      }
    }
  });

  // Recalcular totales/venta con las condiciones nuevas (contractDuration y
  // financiero afectan el motor). Secuencial: serverless con pool limitado.
  for (const quoteId of targetIds) {
    await refreshQuoteTotals(quoteId);
  }

  return { updatedQuoteIds: targetIds };
}
