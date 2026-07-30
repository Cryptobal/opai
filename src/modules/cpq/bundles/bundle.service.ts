/**
 * Servicio de CpqProposalBundle — create/get/totales + helpers de miembros.
 * Toda query filtra por tenantId.
 */

import { prisma } from "@/lib/prisma";
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

async function generateBundleCode(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 1; attempt <= 10; attempt++) {
    const count = await prisma.cpqProposalBundle.count({ where: { tenantId } });
    const code = `PROP-${year}-${String(count + attempt).padStart(3, "0")}`;
    const exists = await prisma.cpqProposalBundle.findFirst({
      where: { code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  throw new BundleServiceError(
    "No se pudo generar código único PROP-",
    "CONFLICT",
    409,
  );
}

const quoteInclude = {
  installation: { select: { id: true, name: true, city: true, address: true } },
  parameters: { select: { marginPct: true, marginMode: true, salePriceMonthly: true } },
} as const;

export type BundleWithMembers = Awaited<
  ReturnType<typeof getBundleById>
>;

export async function createBundle(opts: {
  tenantId: string;
  dealId: string;
  name?: string | null;
  importDealQuotes?: boolean;
}): Promise<{ id: string; code: string }> {
  const { tenantId, dealId, name, importDealQuotes = true } = opts;

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

  const code = await generateBundleCode(tenantId);

  const bundle = await prisma.$transaction(async (tx) => {
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

  return { id: bundle.id, code: bundle.code };
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
