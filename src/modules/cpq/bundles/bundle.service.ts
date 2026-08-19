/**
 * Servicio de CpqProposalBundle — create/get/totales + helpers de miembros.
 * Toda query filtra por tenantId.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextDocumentCode } from "@/lib/cpq/document-counter";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { deleteQuoteToTrash } from "@/modules/cpq/quote-trash.service";
import {
  buildQuoteDeleteImpact,
  type QuoteDeleteBlocker,
} from "@/modules/cpq/quote-delete-impact";
import {
  computeBundleTotals,
  conditionsAreSynced,
  SYNCABLE_CONDITION_FIELDS,
  type BundleTotals,
  type ConditionsSnapshot,
} from "./bundle-totals";

export class BundleServiceError extends Error {
  constructor(
    message: string,
    public code:
      | "NOT_FOUND"
      | "DEAL_NOT_FOUND"
      | "CONFLICT"
      | "CURRENCY_MISMATCH"
      | "VALIDATION",
    public status: number = 400,
  ) {
    super(message);
    this.name = "BundleServiceError";
  }
}

/**
 * La eliminación en cascada de una propuesta arrastra bloqueos de sus
 * cotizaciones hijas (contratos, huella de flujo, aceptación). Se lanza cuando
 * hay bloqueos y el caller no pasó `force`.
 */
export class BundleDeleteBlockedError extends Error {
  constructor(public blockers: QuoteDeleteBlocker[]) {
    super("BUNDLE_DELETE_BLOCKED");
    this.name = "BundleDeleteBlockedError";
  }
}

/** @deprecated Preferir nextDocumentCode(tx, …) dentro de la transacción del caller. */
export async function generateBundleCode(tenantId: string): Promise<string> {
  return prisma.$transaction((tx) => nextDocumentCode(tx, tenantId, "bundle"));
}

const quoteInclude = {
  installation: { select: { id: true, name: true, city: true, address: true } },
  parameters: {
    select: {
      marginPct: true,
      marginMode: true,
      salePriceMonthly: true,
      financialEnabled: true,
      financialRatePct: true,
    },
  },
  additionalLines: {
    orderBy: { orden: "asc" as const },
    select: {
      id: true,
      nombre: true,
      precio: true,
      tipo: true,
      recurrencia: true,
      cantidad: true,
      marginPct: true,
    },
  },
} as const;

export type BundleWithMembers = Awaited<
  ReturnType<typeof getBundleById>
>;

export async function createBundle(opts: {
  tenantId: string;
  dealId: string;
  name?: string | null;
  importDealQuotes?: boolean;
  /** Crea una cotización vacía si el negocio no aportó ninguna (CTA "nueva propuesta"). */
  ensurePrimaryQuote?: boolean;
  userId?: string | null;
}): Promise<{ id: string; code: string; primaryQuoteId: string | null }> {
  const {
    tenantId,
    dealId,
    name,
    importDealQuotes = true,
    ensurePrimaryQuote = false,
  } = opts;

  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: {
      id: true,
      accountId: true,
      primaryContactId: true,
      title: true,
    },
  });
  if (!deal) {
    throw new BundleServiceError("Negocio no encontrado", "DEAL_NOT_FOUND", 404);
  }

  const bundle = await prisma.$transaction(async (tx) => {
    const code = await nextDocumentCode(tx, tenantId, "bundle");
    const created = await tx.cpqProposalBundle.create({
      data: {
        tenantId,
        code,
        name: name?.trim() || deal.title || null,
        status: "draft",
        accountId: deal.accountId,
        contactId: deal.primaryContactId,
        dealId: deal.id,
        currency: "UF",
      },
    });

    if (importDealQuotes) {
      const dealQuotes = await tx.crmDealQuote.findMany({
        where: { tenantId, dealId },
        select: { quoteId: true },
      });
      if (dealQuotes.length > 0) {
        const quoteIds = dealQuotes.map((q) => q.quoteId);
        const alreadyInBundle = await tx.cpqProposalBundleQuote.findMany({
          where: { quoteId: { in: quoteIds } },
          select: { quoteId: true },
        });
        const taken = new Set(alreadyInBundle.map((r) => r.quoteId));
        const available = quoteIds.filter((id) => !taken.has(id));

        if (available.length > 0) {
          const quotes = await tx.cpqQuote.findMany({
            where: { id: { in: available }, tenantId },
            select: { id: true, currency: true },
            orderBy: { createdAt: "asc" },
          });
          const currency = quotes[0]?.currency || "UF";
          const sameCurrency = quotes.filter((q) => q.currency === currency);
          if (sameCurrency.length > 0) {
            await tx.cpqProposalBundle.update({
              where: { id: created.id },
              data: { currency },
            });
            await tx.cpqProposalBundleQuote.createMany({
              data: sameCurrency.map((q, i) => ({
                tenantId,
                bundleId: created.id,
                quoteId: q.id,
                includedInProposal: true,
                displayOrder: i,
              })),
            });
          }
        }
      }
    }

    return created;
  });

  let primaryQuoteId =
    (
      await prisma.cpqProposalBundleQuote.findFirst({
        where: { tenantId, bundleId: bundle.id },
        orderBy: { displayOrder: "asc" },
        select: { quoteId: true },
      })
    )?.quoteId ?? null;

  // Las condiciones del bundle nacen de la primera cotización importada y se
  // propagan al resto: si no, la propuesta arranca "no gobernada" y las hijas
  // quedan divergentes sin ningún indicador.
  if (primaryQuoteId) {
    const { seedBundleConditionsFromQuote } = await import(
      "./propagate-bundle-conditions"
    );
    await seedBundleConditionsFromQuote({
      tenantId,
      bundleId: bundle.id,
      quoteId: primaryQuoteId,
    });
  }

  // El workspace unificado vive en la cotización: si el negocio no aportó
  // ninguna, sembramos la primera instalación para poder abrirlo.
  if (!primaryQuoteId && ensurePrimaryQuote) {
    const { addInstallationToBundle } = await import("./bundle-members.service");
    const installation = await prisma.crmInstallation.findFirst({
      where: { tenantId, accountId: deal.accountId ?? undefined },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (installation) {
      const added = await addInstallationToBundle({
        tenantId,
        bundleId: bundle.id,
        userId: opts.userId ?? null,
        installationId: installation.id,
      });
      primaryQuoteId = added.quoteId;
      if (added.created) {
        const { scheduleGenerateMissingProposalSections } = await import(
          "@/lib/cpq/proposal-sections/generate-missing-for-quote"
        );
        scheduleGenerateMissingProposalSections(tenantId, added.quoteId);
      }
    }
  }

  return { id: bundle.id, code: bundle.code, primaryQuoteId };
}

export async function listBundlesByDeal(opts: {
  tenantId: string;
  dealId: string;
}) {
  return prisma.cpqProposalBundle.findMany({
    where: { tenantId: opts.tenantId, dealId: opts.dealId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      currency: true,
      dealId: true,
      accountId: true,
      contactId: true,
      validUntil: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { quotes: true } },
      // Cotización primaria: destino del workspace unificado.
      quotes: {
        orderBy: { displayOrder: "asc" },
        take: 1,
        select: { quoteId: true },
      },
    },
  });
}

export async function getBundleById(opts: {
  tenantId: string;
  bundleId: string;
}) {
  const bundle = await prisma.cpqProposalBundle.findFirst({
    where: { id: opts.bundleId, tenantId: opts.tenantId },
    include: {
      quotes: {
        orderBy: { displayOrder: "asc" },
        include: {
          quote: {
            include: quoteInclude,
          },
        },
      },
    },
  });
  if (!bundle) {
    throw new BundleServiceError("Propuesta no encontrada", "NOT_FOUND", 404);
  }
  return bundle;
}

export function totalsFromBundle(
  bundle: Awaited<ReturnType<typeof getBundleById>>,
): BundleTotals {
  return computeBundleTotals(
    bundle.quotes.map((m) => ({
      quoteId: m.quoteId,
      includedInProposal: m.includedInProposal,
      monthlyCost: Number(m.quote.monthlyCost),
      totalGuards: m.quote.totalGuards,
      totalPositions: m.quote.totalPositions,
      marginPct:
        m.quote.parameters?.marginPct != null
          ? Number(m.quote.parameters.marginPct)
          : null,
      currency: m.quote.currency,
      installationName: m.quote.installation?.name ?? null,
    })),
  );
}

export function syncStatusFromBundle(
  bundle: Awaited<ReturnType<typeof getBundleById>>,
): { synced: boolean; referenceQuoteId: string | null } {
  const members = bundle.quotes.map((m) => m.quote);
  if (members.length <= 1) {
    return { synced: true, referenceQuoteId: members[0]?.id ?? null };
  }
  const ref = snapshotConditions(members[0]!);
  const others = members.slice(1).map(snapshotConditions);
  return {
    synced: conditionsAreSynced(ref, others),
    referenceQuoteId: members[0]!.id,
  };
}

function snapshotConditions(q: {
  paymentTerms: string;
  serviceStartDays: number;
  contractDuration: number;
  isOngoingService: boolean;
  adjustmentType: string;
  adjustmentFreq: string | null;
  ipcWeight: number | null;
  imoWeight: number | null;
  realAnnualIncrement: number;
  paymentDays: number;
  paymentDayMode: string;
  insurancePolicyUF: unknown;
  liabilityMonths: number;
  validUntil: Date | null;
  currency: string;
}): ConditionsSnapshot {
  const snap: ConditionsSnapshot = {};
  for (const field of SYNCABLE_CONDITION_FIELDS) {
    snap[field] = q[field];
  }
  return snap;
}

/** Claves de condiciones/financiero aceptadas por PATCH que gatillan propagación. */
export const BUNDLE_CONDITION_PATCH_KEYS = [
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
  "financialEnabled",
  "financialRatePct",
  "validUntil",
  "currency",
] as const;

const intOrNull = (
  value: unknown,
  range?: { field: string; min: number; max: number },
): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new BundleServiceError("Valor numérico inválido", "VALIDATION", 400);
  }
  const rounded = Math.round(n);
  if (range && (rounded < range.min || rounded > range.max)) {
    throw new BundleServiceError(
      `${range.field} debe estar entre ${range.min} y ${range.max}`,
      "VALIDATION",
      400,
    );
  }
  return rounded;
};

const decimalOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new BundleServiceError("Valor numérico inválido", "VALIDATION", 400);
  }
  return n;
};

export async function updateBundle(opts: {
  tenantId: string;
  bundleId: string;
  data: {
    name?: string | null;
    validUntil?: string | null;
    status?: string;
    visibleInClientPortal?: boolean | null;
    notes?: string | null;
    contactId?: string | null;
    currency?: string;
    // v2 — condiciones comerciales + financiero a nivel propuesta (null = des-gobernar)
    paymentTerms?: string | null;
    serviceStartDays?: number | null;
    contractDuration?: number | null;
    isOngoingService?: boolean | null;
    adjustmentType?: string | null;
    adjustmentFreq?: string | null;
    ipcWeight?: number | null;
    imoWeight?: number | null;
    insurancePolicyUF?: number | string | null;
    liabilityMonths?: number | null;
    realAnnualIncrement?: number | null;
    paymentDays?: number | null;
    paymentDayMode?: string | null;
    financialEnabled?: boolean | null;
    financialRatePct?: number | string | null;
  };
}) {
  const existing = await prisma.cpqProposalBundle.findFirst({
    where: { id: opts.bundleId, tenantId: opts.tenantId },
    select: { id: true },
  });
  if (!existing) {
    throw new BundleServiceError("Propuesta no encontrada", "NOT_FOUND", 404);
  }

  const d = opts.data;
  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name?.trim() || null;
  if (d.validUntil !== undefined) {
    data.validUntil = d.validUntil ? new Date(d.validUntil) : null;
  }
  if (d.status !== undefined) {
    if (!["draft", "sent", "accepted", "rejected"].includes(d.status)) {
      throw new BundleServiceError("Estado inválido", "VALIDATION", 400);
    }
    data.status = d.status;
  }
  if (d.visibleInClientPortal !== undefined) {
    data.visibleInClientPortal = d.visibleInClientPortal;
  }
  if (d.notes !== undefined) data.notes = d.notes;
  if (d.contactId !== undefined) data.contactId = d.contactId;
  if (d.currency !== undefined) data.currency = d.currency;

  if (d.paymentTerms !== undefined) {
    const terms = d.paymentTerms?.trim() || null;
    if (terms && !["contrafactura", "30_dias", "anticipado"].includes(terms)) {
      throw new BundleServiceError("Forma de pago inválida", "VALIDATION", 400);
    }
    data.paymentTerms = terms;
  }
  if (d.serviceStartDays !== undefined) {
    data.serviceStartDays = intOrNull(d.serviceStartDays, {
      field: "Inicio de servicios",
      min: 1,
      max: 90,
    });
  }
  if (d.contractDuration !== undefined) {
    // 0 dividiría por cero en el prorrateo de costos del motor.
    data.contractDuration = intOrNull(d.contractDuration, {
      field: "Duración del contrato",
      min: 1,
      max: 60,
    });
  }
  if (d.isOngoingService !== undefined) {
    data.isOngoingService =
      typeof d.isOngoingService === "boolean" ? d.isOngoingService : null;
  }
  if (d.adjustmentType !== undefined) {
    if (
      d.adjustmentType != null &&
      !["NONE", "IPC", "IMO", "POLYNOMIAL"].includes(d.adjustmentType)
    ) {
      throw new BundleServiceError("Tipo de reajuste inválido", "VALIDATION", 400);
    }
    data.adjustmentType = d.adjustmentType ?? null;
    if (d.adjustmentType === "NONE") {
      data.adjustmentFreq = null;
      data.ipcWeight = null;
      data.imoWeight = null;
    }
  }
  if (d.adjustmentFreq !== undefined && data.adjustmentFreq === undefined) {
    if (
      d.adjustmentFreq != null &&
      !["TRIMESTRAL", "SEMESTRAL", "ANUAL"].includes(d.adjustmentFreq)
    ) {
      throw new BundleServiceError("Frecuencia de reajuste inválida", "VALIDATION", 400);
    }
    data.adjustmentFreq = d.adjustmentFreq ?? null;
  }
  if (d.ipcWeight !== undefined && data.ipcWeight === undefined) {
    data.ipcWeight = intOrNull(d.ipcWeight, { field: "% IPC", min: 0, max: 100 });
  }
  if (d.imoWeight !== undefined && data.imoWeight === undefined) {
    data.imoWeight = intOrNull(d.imoWeight, { field: "% IMO", min: 0, max: 100 });
  }
  if (d.insurancePolicyUF !== undefined) {
    const uf = decimalOrNull(d.insurancePolicyUF);
    if (uf != null && uf < 0) {
      throw new BundleServiceError(
        "El monto de la póliza no puede ser negativo",
        "VALIDATION",
        400,
      );
    }
    data.insurancePolicyUF = uf;
  }
  if (d.liabilityMonths !== undefined) {
    data.liabilityMonths = intOrNull(d.liabilityMonths, {
      field: "Límite de responsabilidad",
      min: 1,
      max: 24,
    });
  }
  if (d.realAnnualIncrement !== undefined) {
    data.realAnnualIncrement = intOrNull(d.realAnnualIncrement, {
      field: "Incremento real anual",
      min: 0,
      max: 100,
    });
  }
  if (d.paymentDays !== undefined) {
    data.paymentDays = intOrNull(d.paymentDays, {
      field: "Días de pago",
      min: 1,
      max: 30,
    });
  }
  if (d.paymentDayMode !== undefined) {
    data.paymentDayMode = d.paymentDayMode?.trim() || null;
  }
  if (d.financialEnabled !== undefined) {
    data.financialEnabled =
      typeof d.financialEnabled === "boolean" ? d.financialEnabled : null;
  }
  if (d.financialRatePct !== undefined) {
    const rate = decimalOrNull(d.financialRatePct);
    if (rate != null && (rate < 0 || rate > 100)) {
      throw new BundleServiceError(
        "La tasa financiera debe estar entre 0 y 100",
        "VALIDATION",
        400,
      );
    }
    data.financialRatePct = rate;
  }

  return prisma.cpqProposalBundle.update({
    where: { id: opts.bundleId },
    data,
  });
}

export async function assertBundleOwned(tenantId: string, bundleId: string) {
  const b = await prisma.cpqProposalBundle.findFirst({
    where: { id: bundleId, tenantId },
    select: {
      id: true,
      dealId: true,
      accountId: true,
      contactId: true,
      currency: true,
      status: true,
      code: true,
      name: true,
      visibleInClientPortal: true,
    },
  });
  if (!b) {
    throw new BundleServiceError("Propuesta no encontrada", "NOT_FOUND", 404);
  }
  return b;
}

/**
 * Si la propuesta se quedó sin cotizaciones (p. ej. tras enviar la última a la
 * papelera), la elimina: una propuesta vacía no tiene sentido operativo.
 */
export async function ensureBundleNotEmpty(opts: {
  tx?: Prisma.TransactionClient;
  tenantId: string;
  bundleId: string;
}): Promise<{ bundleDeleted: boolean }> {
  const run = async (tx: Prisma.TransactionClient): Promise<{ bundleDeleted: boolean }> => {
    const remaining = await tx.cpqProposalBundleQuote.count({
      where: { tenantId: opts.tenantId, bundleId: opts.bundleId },
    });
    if (remaining > 0) return { bundleDeleted: false };
    await tx.cpqProposalBundle.deleteMany({
      where: { id: opts.bundleId, tenantId: opts.tenantId },
    });
    return { bundleDeleted: true };
  };
  return opts.tx ? run(opts.tx) : prisma.$transaction(run);
}

export type DeleteBundleResult = {
  bundleDeleted: true;
  mode: "unlink" | "cascade";
  trashedQuoteIds: string[];
};

/**
 * Elimina una propuesta:
 * - `unlink`: borra solo la propuesta; las membresías caen por FK cascade y las
 *   cotizaciones sobreviven (quedan "sueltas" en el negocio).
 * - `cascade`: envía cada cotización miembro a la papelera y luego borra la
 *   propuesta. Respeta los bloqueos de las hijas salvo `force`.
 */
export async function deleteBundle(opts: {
  tenantId: string;
  bundleId: string;
  mode: "unlink" | "cascade";
  userId?: string | null;
  force?: boolean;
  reason?: string | null;
}): Promise<DeleteBundleResult> {
  const bundle = await assertBundleOwned(opts.tenantId, opts.bundleId);

  const members = await prisma.cpqProposalBundleQuote.findMany({
    where: { tenantId: opts.tenantId, bundleId: opts.bundleId },
    orderBy: { displayOrder: "asc" },
    select: { quoteId: true },
  });
  const quoteIds = members.map((m) => m.quoteId);

  if (opts.mode === "cascade" && !opts.force && quoteIds.length > 0) {
    const impacts = await Promise.all(
      quoteIds.map((id) => buildQuoteDeleteImpact(opts.tenantId, id)),
    );
    const blockers = dedupeBundleBlockers(
      impacts.flatMap((impact) => impact?.blockers ?? []),
    );
    if (blockers.length > 0) throw new BundleDeleteBlockedError(blockers);
  }

  const trashedQuoteIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    if (opts.mode === "cascade") {
      for (const quoteId of quoteIds) {
        await deleteQuoteToTrash({
          tx,
          tenantId: opts.tenantId,
          quoteId,
          userId: opts.userId ?? null,
          reason: opts.reason ?? null,
        });
        trashedQuoteIds.push(quoteId);
      }
    }
    // unlink: las membresías caen por onDelete: Cascade del FK bundle.
    await tx.cpqProposalBundle.deleteMany({
      where: { id: opts.bundleId, tenantId: opts.tenantId },
    });
    await createCrmHistoryLog(
      {
        tenantId: opts.tenantId,
        entityType: "bundle",
        entityId: opts.bundleId,
        action: "bundle_deleted",
        details: {
          code: bundle.code,
          name: bundle.name,
          mode: opts.mode,
          trashedQuoteIds,
          reason: opts.reason ?? null,
        },
        createdBy: opts.userId ?? null,
      },
      tx as unknown as Parameters<typeof createCrmHistoryLog>[1],
    );
  });

  return { bundleDeleted: true, mode: opts.mode, trashedQuoteIds };
}

function dedupeBundleBlockers(blockers: QuoteDeleteBlocker[]): QuoteDeleteBlocker[] {
  const byCode = new Map<string, QuoteDeleteBlocker>();
  for (const b of blockers) {
    if (!byCode.has(b.code)) byCode.set(b.code, b);
  }
  return [...byCode.values()];
}
