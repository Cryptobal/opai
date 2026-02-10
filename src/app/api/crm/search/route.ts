/**
 * API Route: /api/crm/search
 * GET - Búsqueda global en CRM (leads, cuentas, contactos, negocios, cotizaciones, instalaciones)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

type SearchResult = {
  id: string;
  type: "lead" | "account" | "contact" | "deal" | "quote" | "installation";
  title: string;
  subtitle: string;
  href: string;
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

      // Accounts
      prisma.crmAccount.findMany({
        where: {
          tenantId,
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

      // Contacts
      prisma.crmContact.findMany({
        where: {
          tenantId,
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

      // Quotes
      prisma.cpqQuote.findMany({
        where: {
          tenantId,
          OR: [{ code: contains }, { clientName: contains }, { notes: contains }],
        },
        take: TYPE_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          clientName: true,
          status: true,
        },
      }),

      // Installations
      prisma.crmInstallation.findMany({
        where: {
          tenantId,
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

    const results: SearchResult[] = [];

    for (const lead of leads) {
      const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
      results.push({
        id: lead.id,
        type: "lead",
        title: lead.companyName || name || "Lead sin nombre",
        subtitle: name ? `${name} · ${lead.email || ""}` : lead.email || lead.status || "",
        href: "/crm/leads",
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
      results.push({
        id: contact.id,
        type: "contact",
        title: `${contact.firstName} ${contact.lastName}`.trim(),
        subtitle: [contact.email, contact.account?.name].filter(Boolean).join(" · "),
        href: `/crm/contacts/${contact.id}`,
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
      results.push({
        id: quote.id,
        type: "quote",
        title: quote.code,
        subtitle: [quote.clientName, QUOTE_STATUS_LABEL[quote.status] || quote.status].filter(Boolean).join(" · "),
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
