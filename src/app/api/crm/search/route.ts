/**
 * API Route: /api/crm/search
 * GET - Búsqueda global en CRM (leads, cuentas, contactos, negocios, cotizaciones, instalaciones)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resolvePermissionsById } from "@/lib/permissions-server";

type SearchResult = {
  id: string;
  type: "lead" | "account" | "contact" | "deal" | "quote" | "installation";
  title: string;
  subtitle: string;
  href: string;
  pinDisplay?: string;
};

const TYPE_LIMIT = 5;
const QUOTE_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const contains = { contains: q, mode: "insensitive" as const };
    const tenantId = ctx.tenantId;
    const perms = await resolvePermissionsById(ctx.userId);
    const isSupervisorHub =
      perms.hubLayout === "supervisor" ||
      ctx.userRole?.toLowerCase() === "supervisor";

    // IDs de negocios (deals) cuyo título o nombre de cuenta coincide
    const dealIdsByTitleOrAccount = await prisma.crmDeal.findMany({
      where: {
        tenantId,
        OR: [{ title: contains }, { account: { name: contains } }],
      },
      select: { id: true },
    });
    const dealIdsForQuotes = dealIdsByTitleOrAccount.map((d) => d.id);

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

    const [leads, accounts, contacts, deals, quotes, installations] = await Promise.all([
      // Leads
      prisma.crmLead.findMany({
        where: {
          tenantId,
          OR: [
            { firstName: contains },
            { lastName: contains },
            { companyName: contains },
            { email: contains },
            { phone: contains },
          ],
        },
        take: TYPE_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
          status: true,
        },
      }),

      // Accounts — en hub supervisor solo cuentas con instalaciones activas
      prisma.crmAccount.findMany({
        where: {
          tenantId,
          ...(isSupervisorHub
            ? {
                installations: {
                  some: { status: "active" },
                },
              }
            : {}),
          OR: [
            { name: contains },
            { rut: contains },
            { industry: contains },
          ],
        },
        take: TYPE_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          type: true,
          industry: true,
          rut: true,
        },
      }),

      // Contacts — en hub supervisor solo contactos de cuentas con instalaciones activas
      prisma.crmContact.findMany({
        where: {
          tenantId,
          ...(isSupervisorHub
            ? {
                account: {
                  installations: {
                    some: { status: "active" },
                  },
                },
              }
            : {}),
          OR: [
            { firstName: contains },
            { lastName: contains },
            { email: contains },
            { phone: contains },
          ],
        },
        take: TYPE_LIMIT,
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
      }),

      // Deals
      prisma.crmDeal.findMany({
        where: {
          tenantId,
          OR: [{ title: contains }],
        },
        take: TYPE_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          amount: true,
          account: { select: { name: true } },
          stage: { select: { name: true } },
        },
      }),

      // Quotes (código, cliente, notas o negocio asociado; también por CrmDealQuote)
      prisma.cpqQuote.findMany({
        where: {
          tenantId,
          OR: [
            { code: contains },
            { clientName: contains },
            { notes: contains },
            ...(dealIdsForQuotes.length > 0 ? [{ dealId: { in: dealIdsForQuotes } }] : []),
            ...(quoteIdsFromDealLinks.length > 0 ? [{ id: { in: quoteIdsFromDealLinks } }] : []),
          ],
        },
        take: TYPE_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          clientName: true,
          status: true,
          dealId: true,
        },
      }),

      // Installations — en hub supervisor solo instalaciones activas
      prisma.crmInstallation.findMany({
        where: {
          tenantId,
          ...(isSupervisorHub ? { status: "active" } : {}),
          OR: [
            { name: contains },
            { address: contains },
            { commune: contains },
            { city: contains },
          ],
        },
        take: TYPE_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          address: true,
          account: { select: { name: true } },
        },
      }),
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
      results.push({
        id: quote.id,
        type: "quote",
        title: quote.code,
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
