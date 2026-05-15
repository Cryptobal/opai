/**
 * API Route: /api/crm/search
 * GET - Búsqueda global en CRM (leads, cuentas, contactos, negocios, cotizaciones, instalaciones)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { requireTenantModule } from '@/lib/require-module';
import {
  findCpqQuoteIdsBySearch,
  findCrmAccountIdsBySearch,
  findCrmContactIdsBySearch,
  findCrmDealIdsBySearch,
  findCrmDealIdsByTitleOrAccount,
  findCrmInstallationIdsBySearch,
  findCrmLeadIdsBySearch,
} from "@/lib/search-normalize";

type SearchResult = {
  id: string;
  type: "lead" | "account" | "contact" | "deal" | "quote" | "installation";
  title: string;
  subtitle: string;
  href: string;
  pinDisplay?: string;
};

const TYPE_LIMIT = 10;
const QUOTE_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
};

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx);
    if (forbidden) return forbidden;

    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const tenantId = ctx.tenantId;
    const isSupervisorHub = ctx.userRole?.toLowerCase() === "supervisor";

    // IDs de negocios (deals) cuyo título o nombre de cuenta coincide
    // (búsqueda accent-insensitive via f_unaccent).
    const dealIdsForQuotes = await findCrmDealIdsByTitleOrAccount({ tenantId, query: q });

    // Cotizaciones vinculadas solo por CrmDealQuote (sin dealId en CpqQuote)
    const dealQuoteLinks =
      dealIdsForQuotes.length > 0
        ? await prisma.crmDealQuote.findMany({
            where: { tenantId, dealId: { in: dealIdsForQuotes } },
            select: { quoteId: true, dealId: true },
          })
        : [];
    const quoteIdsFromDealLinks = dealQuoteLinks.map((r) => r.quoteId);
    const quoteIdToDealId = new Map(dealQuoteLinks.map((r) => [r.quoteId, r.dealId]));

    // Resolución en dos pasos: primero IDs vía SQL normalizado (f_unaccent),
    // luego hidratación con findMany para conservar selects/relaciones Prisma.
    const [leadIds, accountIds, contactIds, dealIds, quoteIds, installationIds] =
      await Promise.all([
        findCrmLeadIdsBySearch({ tenantId, query: q, limit: TYPE_LIMIT }),
        findCrmAccountIdsBySearch({
          tenantId,
          query: q,
          limit: TYPE_LIMIT,
          onlySupervisorScope: isSupervisorHub,
        }),
        findCrmContactIdsBySearch({
          tenantId,
          query: q,
          limit: TYPE_LIMIT,
          onlySupervisorScope: isSupervisorHub,
        }),
        findCrmDealIdsBySearch({ tenantId, query: q, limit: TYPE_LIMIT }),
        findCpqQuoteIdsBySearch({
          tenantId,
          query: q,
          limit: TYPE_LIMIT,
          extraDealIds: dealIdsForQuotes,
          extraQuoteIds: quoteIdsFromDealLinks,
        }),
        findCrmInstallationIdsBySearch({
          tenantId,
          query: q,
          limit: TYPE_LIMIT,
          onlyActive: isSupervisorHub,
        }),
      ]);

    const [leads, accounts, contacts, deals, quotes, installations] = await Promise.all([
      leadIds.length > 0
        ? prisma.crmLead.findMany({
            where: { tenantId, id: { in: leadIds } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              companyName: true,
              email: true,
              status: true,
            },
          })
        : Promise.resolve([] as Array<{ id: string; firstName: string | null; lastName: string | null; companyName: string | null; email: string | null; status: string }>),
      accountIds.length > 0
        ? prisma.crmAccount.findMany({
            where: { tenantId, id: { in: accountIds } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              type: true,
              industry: true,
              rut: true,
            },
          })
        : Promise.resolve([] as Array<{ id: string; name: string; type: string; industry: string | null; rut: string | null }>),
      contactIds.length > 0
        ? prisma.crmContact.findMany({
            where: { tenantId, id: { in: contactIds } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              portalPin: true,
              portalPinVisible: true,
              account: { select: { name: true } },
            },
          })
        : Promise.resolve([] as Array<{ id: string; firstName: string; lastName: string; email: string | null; portalPin: string | null; portalPinVisible: string | null; account: { name: string } | null }>),
      dealIds.length > 0
        ? prisma.crmDeal.findMany({
            where: { tenantId, id: { in: dealIds } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              title: true,
              amount: true,
              account: { select: { name: true } },
              stage: { select: { name: true } },
            },
          })
        : Promise.resolve([] as Array<{ id: string; title: string; amount: unknown; account: { name: string } | null; stage: { name: string } | null }>),
      quoteIds.length > 0
        ? prisma.cpqQuote.findMany({
            where: { tenantId, id: { in: quoteIds } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              code: true,
              name: true,
              clientName: true,
              status: true,
              dealId: true,
            },
          })
        : Promise.resolve([] as Array<{ id: string; code: string; name: string | null; clientName: string | null; status: string; dealId: string | null }>),
      installationIds.length > 0
        ? prisma.crmInstallation.findMany({
            where: { tenantId, id: { in: installationIds } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              address: true,
              account: { select: { name: true } },
            },
          })
        : Promise.resolve([] as Array<{ id: string; name: string; address: string | null; account: { name: string } | null }>),
    ]);

    const quoteDealIds = Array.from(
      new Set([
        ...quotes.map((q) => q.dealId).filter((id): id is string => Boolean(id)),
        ...dealIdsForQuotes,
      ])
    );
    const quoteDeals =
      quoteDealIds.length > 0
        ? await prisma.crmDeal.findMany({
            where: {
              tenantId,
              id: { in: quoteDealIds },
            },
            select: {
              id: true,
              title: true,
            },
          })
        : [];
    const quoteDealTitleById = new Map(quoteDeals.map((deal) => [deal.id, deal.title]));

    const results: SearchResult[] = [];

    for (const lead of leads) {
      const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
      results.push({
        id: lead.id,
        type: "lead",
        title: lead.companyName || name || "Lead sin nombre",
        subtitle: name ? `${name} · ${lead.email || ""}` : lead.email || lead.status || "",
        href: `/crm/leads/${lead.id}`,
      });
    }

    for (const acc of accounts) {
      results.push({
        id: acc.id,
        type: "account",
        title: acc.name,
        subtitle: [acc.type === "client" ? "Cliente" : "Prospecto", acc.industry, acc.rut].filter(Boolean).join(" · "),
        href: `/crm/accounts/${acc.id}`,
      });
    }

    for (const contact of contacts) {
      const pinDisplay = contact.portalPinVisible
        ? `PIN: ${contact.portalPinVisible}`
        : contact.portalPin
          ? "PIN: Configurado"
          : "Sin PIN";
      const subtitleParts = [contact.account?.name].filter(Boolean);
      results.push({
        id: contact.id,
        type: "contact",
        title: `${contact.firstName} ${contact.lastName}`.trim(),
        subtitle: subtitleParts.length ? subtitleParts.join(" · ") : "Sin cuenta",
        href: `/crm/contacts/${contact.id}`,
        pinDisplay,
      });
    }

    for (const deal of deals) {
      results.push({
        id: deal.id,
        type: "deal",
        title: deal.title,
        subtitle: [deal.account?.name, deal.stage?.name, `$${Number(deal.amount).toLocaleString("es-CL")}`].filter(Boolean).join(" · "),
        href: `/crm/deals/${deal.id}`,
      });
    }

    for (const quote of quotes) {
      const dealIdForQuote = quote.dealId ?? quoteIdToDealId.get(quote.id);
      const dealTitle = dealIdForQuote
        ? quoteDealTitleById.get(dealIdForQuote) ?? "Sin negocio"
        : "Sin negocio";
      const quoteName = quote.name?.trim();
      results.push({
        id: quote.id,
        type: "quote",
        title: quoteName ? `${quote.code} · ${quoteName}` : quote.code,
        subtitle: [
          `Negocio: ${dealTitle}`,
          quote.clientName,
          QUOTE_STATUS_LABEL[quote.status] || quote.status,
        ].filter(Boolean).join(" · "),
        href: `/crm/cotizaciones/${quote.id}`,
      });
    }

    for (const inst of installations) {
      results.push({
        id: inst.id,
        type: "installation",
        title: inst.name,
        subtitle: [inst.address, inst.account?.name].filter(Boolean).join(" · "),
        href: `/crm/installations/${inst.id}`,
      });
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("Error in CRM search:", error);
    return NextResponse.json(
      { success: false, error: "Search failed" },
      { status: 500 }
    );
  }
}
