/**
 * Miembros de un proposal bundle: agregar / quitar / reordenar / sync condiciones.
 */

import { prisma } from "@/lib/prisma";
import { applyDefaultQuoteIncludes } from "@/lib/cpq/apply-default-quote-includes";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { syncCrmDealQuoteLink } from "@/lib/crm-sync-quote-deal-link";
import { cloneCpqQuote } from "@/modules/cpq/clone-quote.service";
import {
  assertBundleOwned,
  BundleServiceError,
} from "./bundle.service";
import { SYNCABLE_CONDITION_FIELDS } from "./bundle-totals";
import { propagateBundleConditions } from "./propagate-bundle-conditions";

async function generateQuoteCode(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 1; attempt <= 10; attempt++) {
    const count = await prisma.cpqQuote.count({ where: { tenantId } });
    const code = `CPQ-${year}-${String(count + attempt).padStart(3, "0")}`;
    const exists = await prisma.cpqQuote.findFirst({
      where: { code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  throw new BundleServiceError(
    "No se pudo generar código único CPQ-",
    "CONFLICT",
    409,
  );
}

async function linkQuoteToBundle(opts: {
  tenantId: string;
  bundleId: string;
  quoteId: string;
  currency: string;
  bundleCurrency: string;
}) {
  if (opts.currency !== opts.bundleCurrency) {
    throw new BundleServiceError(
      `La cotización usa moneda ${opts.currency} pero la propuesta es ${opts.bundleCurrency}. Sincroniza la moneda antes de agregar.`,
      "CURRENCY_MISMATCH",
      409,
    );
  }

  const existing = await prisma.cpqProposalBundleQuote.findUnique({
    where: { quoteId: opts.quoteId },
    include: {
      bundle: { select: { id: true, code: true, name: true } },
    },
  });
  if (existing) {
    if (existing.bundleId === opts.bundleId) {
      throw new BundleServiceError(
        "La cotización ya pertenece a esta propuesta",
        "CONFLICT",
        409,
      );
    }
    throw new BundleServiceError(
      `La cotización ya pertenece a la propuesta ${existing.bundle.code}${existing.bundle.name ? ` (${existing.bundle.name})` : ""}`,
      "CONFLICT",
      409,
    );
  }

  const maxOrder = await prisma.cpqProposalBundleQuote.aggregate({
    where: { bundleId: opts.bundleId, tenantId: opts.tenantId },
    _max: { displayOrder: true },
  });
  const displayOrder = (maxOrder._max.displayOrder ?? -1) + 1;

  return prisma.cpqProposalBundleQuote.create({
    data: {
      tenantId: opts.tenantId,
      bundleId: opts.bundleId,
      quoteId: opts.quoteId,
      includedInProposal: true,
      displayOrder,
    },
  });
}

export async function addInstallationToBundle(opts: {
  tenantId: string;
  bundleId: string;
  userId?: string | null;
  /** Instalación existente de la cuenta */
  installationId?: string | null;
  /** Crear instalación nueva */
  newInstallation?: {
    name: string;
    address?: string | null;
    city?: string | null;
    commune?: string | null;
  } | null;
  /** Copiar dotación desde otra cotización del bundle (o del deal) */
  cloneFromQuoteId?: string | null;
  /** Vincular cotización existente (sin crear) */
  existingQuoteId?: string | null;
  quoteName?: string | null;
}) {
  const bundle = await assertBundleOwned(opts.tenantId, opts.bundleId);
  if (!bundle.accountId) {
    throw new BundleServiceError(
      "La propuesta no tiene cuenta asociada",
      "VALIDATION",
      400,
    );
  }

  // ── Vincular quote existente ──
  if (opts.existingQuoteId) {
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: opts.existingQuoteId, tenantId: opts.tenantId },
      select: {
        id: true,
        currency: true,
        accountId: true,
        dealId: true,
        installationId: true,
      },
    });
    if (!quote) {
      throw new BundleServiceError("Cotización no encontrada", "NOT_FOUND", 404);
    }
    if (quote.accountId && quote.accountId !== bundle.accountId) {
      throw new BundleServiceError(
        "La cotización pertenece a otra cuenta",
        "CONFLICT",
        403,
      );
    }
    const member = await linkQuoteToBundle({
      tenantId: opts.tenantId,
      bundleId: opts.bundleId,
      quoteId: quote.id,
      currency: quote.currency,
      bundleCurrency: bundle.currency,
    });
    const linked = await afterInstallationLinked({
      tenantId: opts.tenantId,
      bundleId: opts.bundleId,
      quoteId: quote.id,
      created: false,
      userId: opts.userId ?? null,
    });
    return {
      member,
      quoteId: quote.id,
      created: false as const,
      propagationError: linked.propagationError,
    };
  }

  // ── Resolver instalación ──
  let installationId = opts.installationId?.trim() || null;
  if (opts.newInstallation?.name?.trim()) {
    const name = opts.newInstallation.name.trim();
    const existingSameName = await prisma.crmInstallation.findFirst({
      where: {
        tenantId: opts.tenantId,
        accountId: bundle.accountId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existingSameName) {
      installationId = existingSameName.id;
    } else {
      const created = await prisma.crmInstallation.create({
        data: {
          tenantId: opts.tenantId,
          accountId: bundle.accountId,
          name,
          address: opts.newInstallation.address?.trim() || null,
          city: opts.newInstallation.city?.trim() || null,
          commune: opts.newInstallation.commune?.trim() || null,
          nocturnoEnabled: false,
          chatEnabled: false,
        },
      });
      installationId = created.id;
    }
  }

  if (!installationId) {
    throw new BundleServiceError(
      "Debes indicar installationId o newInstallation.name",
      "VALIDATION",
      400,
    );
  }

  const installation = await prisma.crmInstallation.findFirst({
    where: {
      id: installationId,
      tenantId: opts.tenantId,
      accountId: bundle.accountId,
    },
    select: { id: true, name: true },
  });
  if (!installation) {
    throw new BundleServiceError(
      "La instalación no existe o no pertenece a la cuenta",
      "NOT_FOUND",
      404,
    );
  }

  // ── Clonar desde otra cotización ──
  if (opts.cloneFromQuoteId) {
    const source = await prisma.cpqQuote.findFirst({
      where: { id: opts.cloneFromQuoteId, tenantId: opts.tenantId },
      select: { id: true, currency: true, accountId: true },
    });
    if (!source) {
      throw new BundleServiceError(
        "Cotización fuente no encontrada",
        "NOT_FOUND",
        404,
      );
    }
    if (source.currency !== bundle.currency) {
      throw new BundleServiceError(
        `La cotización fuente usa moneda ${source.currency} pero la propuesta es ${bundle.currency}`,
        "CURRENCY_MISMATCH",
        409,
      );
    }

    const cloned = await cloneCpqQuote({
      tenantId: opts.tenantId,
      sourceQuoteId: source.id,
      overrideName:
        opts.quoteName?.trim() ||
        `Cotización — ${installation.name}`,
      createdBy: opts.userId ?? null,
      overrideInstallationId: installation.id,
      overrideDealId: bundle.dealId,
      overrideAccountId: bundle.accountId,
      overrideContactId: bundle.contactId,
    });

    const member = await linkQuoteToBundle({
      tenantId: opts.tenantId,
      bundleId: opts.bundleId,
      quoteId: cloned.id,
      currency: source.currency,
      bundleCurrency: bundle.currency,
    });
    const linked = await afterInstallationLinked({
      tenantId: opts.tenantId,
      bundleId: opts.bundleId,
      quoteId: cloned.id,
      created: true,
      clonedFromQuoteId: source.id,
      userId: opts.userId ?? null,
    });
    return {
      member,
      quoteId: cloned.id,
      created: true as const,
      propagationError: linked.propagationError,
    };
  }

  // ── Cotización vacía nueva ──
  const code = await generateQuoteCode(opts.tenantId);
  const quote = await prisma.cpqQuote.create({
    data: {
      tenantId: opts.tenantId,
      code,
      name:
        opts.quoteName?.trim() ||
        `Cotización — ${installation.name}`,
      status: "draft",
      currency: bundle.currency,
      accountId: bundle.accountId,
      contactId: bundle.contactId,
      dealId: bundle.dealId,
      installationId: installation.id,
      insurancePolicyUF: 1500,
    },
  });

  try {
    await applyDefaultQuoteIncludes(prisma, quote.id, opts.tenantId);
  } catch (err) {
    console.error("[bundle] default includes:", err);
  }

  await prisma.$transaction(async (tx) => {
    await syncCrmDealQuoteLink(tx, {
      tenantId: opts.tenantId,
      quoteId: quote.id,
      dealId: bundle.dealId,
    });
  });

  await createCrmHistoryLog({
    tenantId: opts.tenantId,
    entityType: "quote",
    entityId: quote.id,
    action: "quote_created",
    details: {
      code: quote.code,
      fromBundleId: opts.bundleId,
      installationId: installation.id,
    },
    createdBy: opts.userId ?? null,
  });

  const member = await linkQuoteToBundle({
    tenantId: opts.tenantId,
    bundleId: opts.bundleId,
    quoteId: quote.id,
    currency: quote.currency,
    bundleCurrency: bundle.currency,
  });
  const linked = await afterInstallationLinked({
    tenantId: opts.tenantId,
    bundleId: opts.bundleId,
    quoteId: quote.id,
    created: true,
    userId: opts.userId ?? null,
  });

  return {
    member,
    quoteId: quote.id,
    created: true as const,
    propagationError: linked.propagationError,
  };
}

/**
 * Post-vínculo: la hija hereda las condiciones gobernadas por el bundle
 * (propagación acotada a esa quote) y el evento queda auditado.
 */
async function afterInstallationLinked(opts: {
  tenantId: string;
  bundleId: string;
  quoteId: string;
  created: boolean;
  clonedFromQuoteId?: string | null;
  userId?: string | null;
}) {
  // Un fallo aquí no debe deshacer el alta de la instalación, pero tampoco puede
  // quedar invisible: la hija arrancaría con condiciones distintas al resto.
  let propagationError: string | null = null;
  try {
    await propagateBundleConditions({
      tenantId: opts.tenantId,
      bundleId: opts.bundleId,
      quoteIds: [opts.quoteId],
    });
  } catch (err) {
    propagationError = err instanceof Error ? err.message : String(err);
    console.error("[bundle] propagate on link:", err);
  }
  await createCrmHistoryLog({
    tenantId: opts.tenantId,
    entityType: "bundle",
    entityId: opts.bundleId,
    action: "bundle_installation_added",
    details: {
      quoteId: opts.quoteId,
      created: opts.created,
      ...(opts.clonedFromQuoteId
        ? { clonedFromQuoteId: opts.clonedFromQuoteId }
        : {}),
      ...(propagationError
        ? {
            advertencia:
              "No se pudieron aplicar las condiciones de la propuesta a esta instalación",
            error: propagationError,
          }
        : {}),
    },
    createdBy: opts.userId ?? null,
  });
  return { propagationError };
}

export async function removeQuoteFromBundle(opts: {
  tenantId: string;
  bundleId: string;
  quoteId: string;
  userId?: string | null;
}) {
  await assertBundleOwned(opts.tenantId, opts.bundleId);
  const member = await prisma.cpqProposalBundleQuote.findFirst({
    where: {
      tenantId: opts.tenantId,
      bundleId: opts.bundleId,
      quoteId: opts.quoteId,
    },
  });
  if (!member) {
    throw new BundleServiceError(
      "La cotización no pertenece a esta propuesta",
      "NOT_FOUND",
      404,
    );
  }
  await prisma.cpqProposalBundleQuote.delete({ where: { id: member.id } });
  await createCrmHistoryLog({
    tenantId: opts.tenantId,
    entityType: "bundle",
    entityId: opts.bundleId,
    action: "bundle_installation_removed",
    details: { quoteId: opts.quoteId },
    createdBy: opts.userId ?? null,
  });
  return { ok: true };
}

export async function patchBundleQuotes(opts: {
  tenantId: string;
  bundleId: string;
  userId?: string | null;
  updates: Array<{
    quoteId: string;
    includedInProposal?: boolean;
    displayOrder?: number;
  }>;
}) {
  await assertBundleOwned(opts.tenantId, opts.bundleId);
  if (!Array.isArray(opts.updates) || opts.updates.length === 0) {
    throw new BundleServiceError("Sin actualizaciones", "VALIDATION", 400);
  }

  await prisma.$transaction(async (tx) => {
    for (const u of opts.updates) {
      const member = await tx.cpqProposalBundleQuote.findFirst({
        where: {
          tenantId: opts.tenantId,
          bundleId: opts.bundleId,
          quoteId: u.quoteId,
        },
        select: { id: true },
      });
      if (!member) {
        throw new BundleServiceError(
          `Cotización ${u.quoteId} no pertenece a la propuesta`,
          "NOT_FOUND",
          404,
        );
      }
      const data: { includedInProposal?: boolean; displayOrder?: number } = {};
      if (typeof u.includedInProposal === "boolean") {
        data.includedInProposal = u.includedInProposal;
      }
      if (typeof u.displayOrder === "number") {
        data.displayOrder = u.displayOrder;
      }
      if (Object.keys(data).length > 0) {
        await tx.cpqProposalBundleQuote.update({
          where: { id: member.id },
          data,
        });
      }
    }
  });

  const includeChanges = opts.updates.filter(
    (u) => typeof u.includedInProposal === "boolean",
  );
  if (includeChanges.length > 0) {
    await createCrmHistoryLog({
      tenantId: opts.tenantId,
      entityType: "bundle",
      entityId: opts.bundleId,
      action: "bundle_installations_updated",
      details: {
        updates: includeChanges.map((u) => ({
          quoteId: u.quoteId,
          includedInProposal: u.includedInProposal,
        })),
      },
      createdBy: opts.userId ?? null,
    });
  }

  return { ok: true };
}

export async function syncBundleConditions(opts: {
  tenantId: string;
  bundleId: string;
  /** Si se omite, usa la primera cotización por displayOrder */
  sourceQuoteId?: string | null;
}) {
  const bundle = await assertBundleOwned(opts.tenantId, opts.bundleId);
  const members = await prisma.cpqProposalBundleQuote.findMany({
    where: { tenantId: opts.tenantId, bundleId: opts.bundleId },
    orderBy: { displayOrder: "asc" },
    include: {
      quote: {
        select: {
          id: true,
          paymentTerms: true,
          serviceStartDays: true,
          contractDuration: true,
          isOngoingService: true,
          adjustmentType: true,
          adjustmentFreq: true,
          ipcWeight: true,
          imoWeight: true,
          realAnnualIncrement: true,
          paymentDays: true,
          paymentDayMode: true,
          insurancePolicyUF: true,
          liabilityMonths: true,
          validUntil: true,
          currency: true,
        },
      },
    },
  });

  if (members.length === 0) {
    throw new BundleServiceError(
      "La propuesta no tiene cotizaciones",
      "VALIDATION",
      400,
    );
  }

  const sourceMember = opts.sourceQuoteId
    ? members.find((m) => m.quoteId === opts.sourceQuoteId)
    : members[0];
  if (!sourceMember) {
    throw new BundleServiceError(
      "Cotización fuente no encontrada en la propuesta",
      "NOT_FOUND",
      404,
    );
  }

  const src = sourceMember.quote;

  // v2: la fuente de verdad pasa a ser el bundle. Persistimos en él las
  // condiciones y el financiero de la cotización fuente y delegamos en la
  // propagación estándar. La fuente queda FUERA del destino: es la que define
  // los valores, no debe recibir el financiero que el bundle traía de antes.
  const sourceParams = await prisma.cpqQuoteParameters.findUnique({
    where: { quoteId: sourceMember.quoteId },
    select: { financialEnabled: true, financialRatePct: true },
  });
  const bundleData: Record<string, unknown> = {};
  for (const field of SYNCABLE_CONDITION_FIELDS) {
    bundleData[field] = src[field];
  }
  if (sourceParams) {
    bundleData.financialEnabled = sourceParams.financialEnabled;
    bundleData.financialRatePct = sourceParams.financialRatePct;
  }
  await prisma.cpqProposalBundle.update({
    where: { id: bundle.id },
    data: bundleData,
  });

  const targetIds = members
    .filter((m) => m.quoteId !== sourceMember.quoteId)
    .map((m) => m.quoteId);
  if (targetIds.length > 0) {
    await propagateBundleConditions({
      tenantId: opts.tenantId,
      bundleId: opts.bundleId,
      quoteIds: targetIds,
    });
  }

  return {
    ok: true,
    sourceQuoteId: sourceMember.quoteId,
    updatedCount: targetIds.length,
    currency: src.currency,
  };
}
