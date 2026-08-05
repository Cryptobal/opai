/**
 * Impacto de eliminación de cotizaciones / propuestas / negocios.
 *
 * Calcula, sin mutar nada, qué se vería afectado al eliminar una cotización
 * (o un negocio/cuenta que la contiene) y qué condiciones deberían BLOQUEAR
 * el borrado directo (requiriendo `force`). Toda query filtra por tenantId.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  loadDealAgendaImpact,
  loadDealInstallationImpact,
  type DealAgendaImpact,
  type DealInstallationImpact,
} from "@/modules/crm/deal-delete-cascade";

export type QuoteDeleteBlocker = { code: string; label: string };

export type QuoteDeleteImpact = {
  quote: { id: string; code: string; name: string | null; status: string };
  bundle: { id: string; code: string; memberCount: number } | null;
  counts: {
    positions: number;
    attachments: number;
    emailThreads: number;
    tasks: number;
  };
  blockers: QuoteDeleteBlocker[];
  warnings: string[];
};

export type DealDeleteImpact = {
  deal: { id: string; title: string };
  quotes: QuoteDeleteImpact[];
  bundles: Array<{ id: string; code: string; memberCount: number }>;
  agenda: DealAgendaImpact;
  installation: DealInstallationImpact;
  counts: {
    quotes: number;
    bundles: number;
    positions: number;
    attachments: number;
    agendaEvents: number;
    licitacionBands: number;
  };
  blockers: QuoteDeleteBlocker[];
  warnings: string[];
};

export type AccountDeleteImpact = {
  account: { id: string; name: string };
  deals: DealDeleteImpact[];
  /** Cotizaciones colgando directo de la cuenta sin negocio. */
  orphanQuotes: QuoteDeleteImpact[];
  counts: {
    deals: number;
    quotes: number;
    bundles: number;
  };
  blockers: QuoteDeleteBlocker[];
  warnings: string[];
};

/** Estados que ya generaron huella de flujo de caja proyectado. */
const CASHFLOW_STATUSES = ["approved", "accepted", "active", "in_progress"];
/** Estados que implican aceptación (portal cliente / adjudicación). */
const ACCEPTED_STATUSES = ["approved", "accepted"];

const CONTRACT_CATEGORIES = ["contrato_servicio", "contrato_cliente"];

type QuoteImpactRow = {
  id: string;
  code: string;
  name: string | null;
  status: string;
  contractStartDate: Date | null;
  visibleInClientPortal: boolean | null;
  _count: { positions: number; attachments: number };
  proposalBundleQuote: {
    bundle: { id: string; code: string; _count: { quotes: number } };
  } | null;
};

const QUOTE_IMPACT_SELECT = {
  id: true,
  code: true,
  name: true,
  status: true,
  contractStartDate: true,
  visibleInClientPortal: true,
  _count: { select: { positions: true, attachments: true } },
  proposalBundleQuote: {
    select: {
      bundle: {
        select: { id: true, code: true, _count: { select: { quotes: true } } },
      },
    },
  },
} satisfies Prisma.CpqQuoteSelect;

/**
 * Cuenta contratos de servicio generados desde esta cotización. El quoteId se
 * persiste en `Document.contractMetadata->>'quoteId'` (ver generate-service-contract).
 */
async function countGeneratedContracts(tenantId: string, quoteId: string): Promise<number> {
  return prisma.document.count({
    where: {
      tenantId,
      category: { in: CONTRACT_CATEGORIES },
      contractMetadata: { path: ["quoteId"], equals: quoteId },
    },
  });
}

async function countQuoteRelations(
  tenantId: string,
  quoteId: string,
): Promise<{ emailThreads: number; tasks: number }> {
  const [emailThreads, tasks] = await Promise.all([
    prisma.crmEmailThreadLink.count({
      where: { tenantId, entityType: "quote", entityId: quoteId },
    }),
    prisma.crmTask.count({ where: { tenantId, quoteId } }),
  ]);
  return { emailThreads, tasks };
}

function computeQuoteBlockers(
  row: Pick<QuoteImpactRow, "status" | "contractStartDate">,
  contractCount: number,
): QuoteDeleteBlocker[] {
  const blockers: QuoteDeleteBlocker[] = [];

  if (contractCount > 0) {
    blockers.push({
      code: "CONTRACT_GENERATED",
      label:
        contractCount === 1
          ? "Tiene un contrato de servicio generado"
          : `Tiene ${contractCount} contratos de servicio generados`,
    });
  }

  if (CASHFLOW_STATUSES.includes(row.status) && row.contractStartDate != null) {
    blockers.push({
      code: "CASHFLOW_FOOTPRINT",
      label: "Aporta huella al flujo de caja proyectado",
    });
  }

  if (ACCEPTED_STATUSES.includes(row.status)) {
    blockers.push({
      code: "PORTAL_ACCEPTED",
      label: "Fue aceptada por el cliente",
    });
  }

  return blockers;
}

async function buildImpactFromRow(
  tenantId: string,
  row: QuoteImpactRow,
): Promise<QuoteDeleteImpact> {
  const [contractCount, relations] = await Promise.all([
    countGeneratedContracts(tenantId, row.id),
    countQuoteRelations(tenantId, row.id),
  ]);

  const bundle = row.proposalBundleQuote?.bundle
    ? {
        id: row.proposalBundleQuote.bundle.id,
        code: row.proposalBundleQuote.bundle.code,
        memberCount: row.proposalBundleQuote.bundle._count.quotes,
      }
    : null;

  const warnings: string[] = [];
  if (bundle && bundle.memberCount <= 1) {
    warnings.push("Es la única cotización de su propuesta; la propuesta quedará vacía y se eliminará.");
  }

  return {
    quote: { id: row.id, code: row.code, name: row.name, status: row.status },
    bundle,
    counts: {
      positions: row._count.positions,
      attachments: row._count.attachments,
      emailThreads: relations.emailThreads,
      tasks: relations.tasks,
    },
    blockers: computeQuoteBlockers(row, contractCount),
    warnings,
  };
}

export async function buildQuoteDeleteImpact(
  tenantId: string,
  quoteId: string,
): Promise<QuoteDeleteImpact | null> {
  const row = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    select: QUOTE_IMPACT_SELECT,
  });
  if (!row) return null;
  return buildImpactFromRow(tenantId, row as QuoteImpactRow);
}

/** IDs de cotización del negocio: FK directa (dealId) unida a los links crm.deal_quotes. */
export async function resolveDealQuoteIds(tenantId: string, dealId: string): Promise<string[]> {
  const [direct, links] = await Promise.all([
    prisma.cpqQuote.findMany({
      where: { tenantId, dealId },
      select: { id: true },
    }),
    prisma.crmDealQuote.findMany({
      where: { tenantId, dealId },
      select: { quoteId: true },
    }),
  ]);
  const ids = new Set<string>();
  for (const q of direct) ids.add(q.id);
  for (const l of links) ids.add(l.quoteId);
  return [...ids];
}

export async function buildDealDeleteImpact(
  tenantId: string,
  dealId: string,
): Promise<DealDeleteImpact | null> {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { id: true, title: true },
  });
  if (!deal) return null;

  const quoteIds = await resolveDealQuoteIds(tenantId, dealId);
  const rows =
    quoteIds.length > 0
      ? await prisma.cpqQuote.findMany({
          where: { id: { in: quoteIds }, tenantId },
          select: QUOTE_IMPACT_SELECT,
        })
      : [];

  const quotes = await Promise.all(
    (rows as QuoteImpactRow[]).map((row) => buildImpactFromRow(tenantId, row)),
  );

  const bundleRows = await prisma.cpqProposalBundle.findMany({
    where: { tenantId, dealId },
    select: { id: true, code: true, _count: { select: { quotes: true } } },
  });
  const bundles = bundleRows.map((b) => ({
    id: b.id,
    code: b.code,
    memberCount: b._count.quotes,
  }));

  const [agenda, installation] = await Promise.all([
    loadDealAgendaImpact(tenantId, dealId),
    loadDealInstallationImpact(tenantId, dealId, quoteIds),
  ]);

  const blockers = dedupeBlockers(quotes.flatMap((q) => q.blockers));
  const warnings = [...new Set(quotes.flatMap((q) => q.warnings))];
  if (agenda.counts.agendaEvents > 0) {
    warnings.push(
      `${agenda.counts.agendaEvents} evento${agenda.counts.agendaEvents === 1 ? "" : "s"} de agenda se cancelarán también en Google Calendar`,
    );
  }
  if (agenda.counts.licitacionBands > 0) {
    warnings.push("La banda de licitación se eliminará de la agenda y de Google Calendar");
  }
  if (installation && !installation.canDelete) {
    warnings.push(
      `Instalación «${installation.name}» no se elimina: ${installation.blockers.map((b) => b.label).join("; ")}`,
    );
  }

  return {
    deal,
    quotes,
    bundles,
    agenda,
    installation,
    counts: {
      quotes: quotes.length,
      bundles: bundles.length,
      positions: quotes.reduce((sum, q) => sum + q.counts.positions, 0),
      attachments: quotes.reduce((sum, q) => sum + q.counts.attachments, 0),
      agendaEvents: agenda.counts.agendaEvents,
      licitacionBands: agenda.counts.licitacionBands,
    },
    blockers,
    warnings,
  };
}

export async function buildAccountDeleteImpact(
  tenantId: string,
  accountId: string,
): Promise<AccountDeleteImpact | null> {
  const account = await prisma.crmAccount.findFirst({
    where: { id: accountId, tenantId },
    select: { id: true, name: true },
  });
  if (!account) return null;

  const dealRows = await prisma.crmDeal.findMany({
    where: { tenantId, accountId },
    select: { id: true },
  });
  const deals = (
    await Promise.all(dealRows.map((d) => buildDealDeleteImpact(tenantId, d.id)))
  ).filter((d): d is DealDeleteImpact => d != null);

  // Cotizaciones colgando de la cuenta sin negocio asociado.
  const orphanRows = await prisma.cpqQuote.findMany({
    where: { tenantId, accountId, dealId: null },
    select: QUOTE_IMPACT_SELECT,
  });
  const orphanQuotes = await Promise.all(
    (orphanRows as QuoteImpactRow[]).map((row) => buildImpactFromRow(tenantId, row)),
  );

  const blockers = dedupeBlockers([
    ...deals.flatMap((d) => d.blockers),
    ...orphanQuotes.flatMap((q) => q.blockers),
  ]);
  const warnings = [
    ...new Set([
      ...deals.flatMap((d) => d.warnings),
      ...orphanQuotes.flatMap((q) => q.warnings),
    ]),
  ];

  return {
    account,
    deals,
    orphanQuotes,
    counts: {
      deals: deals.length,
      quotes:
        deals.reduce((sum, d) => sum + d.counts.quotes, 0) + orphanQuotes.length,
      bundles: deals.reduce((sum, d) => sum + d.counts.bundles, 0),
    },
    blockers,
    warnings,
  };
}

function dedupeBlockers(blockers: QuoteDeleteBlocker[]): QuoteDeleteBlocker[] {
  const byCode = new Map<string, QuoteDeleteBlocker>();
  for (const b of blockers) {
    if (!byCode.has(b.code)) byCode.set(b.code, b);
  }
  return [...byCode.values()];
}
