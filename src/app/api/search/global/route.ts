/**
 * API Route: /api/search/global
 * GET - Búsqueda global: CRM, Operaciones (guardias), Documentos
 * Respeta permisos del usuario por módulo.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasModuleAccess } from "@/lib/permissions";
import { ensureOpsAccess } from "@/lib/ops";

export type GlobalSearchResult = {
  id: string;
  type: "lead" | "account" | "contact" | "deal" | "quote" | "installation" | "guardia" | "document";
  title: string;
  subtitle: string;
  href: string;
};

const CRM_TYPE_LIMIT = 4;
const OPS_LIMIT = 6;
const DOCS_LIMIT = 5;

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

    const perms = await resolveApiPerms(ctx);
    const hasCrm = hasModuleAccess(perms, "crm");
    const hasOps = hasModuleAccess(perms, "ops");
    const hasDocs = hasModuleAccess(perms, "docs");

    const isSupervisorHub =
      perms.hubLayout === "supervisor" || ctx.userRole?.toLowerCase() === "supervisor";

    const contains = { contains: q, mode: "insensitive" as const };
    const tenantId = ctx.tenantId;
    const results: GlobalSearchResult[] = [];

    // ── CRM (leads, accounts, contacts, deals, quotes, installations) ──
    if (hasCrm) {
      const [leads, accounts, contacts, deals, quotes, installations] = await Promise.all([
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
          take: CRM_TYPE_LIMIT,
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
        prisma.crmAccount.findMany({
          where: {
            tenantId,
            ...(isSupervisorHub ? { installations: { some: { isActive: true } } } : {}),
            OR: [{ name: contains }, { rut: contains }, { industry: contains }],
          },
          take: CRM_TYPE_LIMIT,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            type: true,
            industry: true,
            rut: true,
          },
        }),
        prisma.crmContact.findMany({
          where: {
            tenantId,
            ...(isSupervisorHub
              ? { account: { installations: { some: { isActive: true } } } }
              : {}),
            OR: [
              { firstName: contains },
              { lastName: contains },
              { email: contains },
              { phone: contains },
            ],
          },
          take: CRM_TYPE_LIMIT,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            account: { select: { name: true } },
          },
        }),
        prisma.crmDeal.findMany({
          where: { tenantId, OR: [{ title: contains }] },
          take: CRM_TYPE_LIMIT,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            amount: true,
            account: { select: { name: true } },
            stage: { select: { name: true } },
          },
        }),
        prisma.cpqQuote.findMany({
          where: {
            tenantId,
            OR: [{ code: contains }, { clientName: contains }, { notes: contains }],
          },
          take: CRM_TYPE_LIMIT,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            code: true,
            clientName: true,
            status: true,
            dealId: true,
          },
        }),
        prisma.crmInstallation.findMany({
          where: {
            tenantId,
            ...(isSupervisorHub ? { isActive: true } : {}),
            OR: [
              { name: contains },
              { address: contains },
              { commune: contains },
              { city: contains },
            ],
          },
          take: CRM_TYPE_LIMIT,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            address: true,
            account: { select: { name: true } },
          },
        }),
      ]);

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
          subtitle: [acc.type === "client" ? "Cliente" : "Prospecto", acc.industry, acc.rut]
            .filter(Boolean)
            .join(" · "),
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
          subtitle: [
            deal.account?.name,
            deal.stage?.name,
            `$${Number(deal.amount).toLocaleString("es-CL")}`,
          ]
            .filter(Boolean)
            .join(" · "),
          href: `/crm/deals/${deal.id}`,
        });
      }
      const quoteDealIds = Array.from(
        new Set(
          quotes
            .map((quote) => quote.dealId)
            .filter((dealId): dealId is string => Boolean(dealId))
        )
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

      for (const quote of quotes) {
        const dealTitle = quote.dealId
          ? quoteDealTitleById.get(quote.dealId) ?? "Sin negocio"
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
    }

    // ── Ops (guardias por nombre, código, RUT) ──
    if (hasOps) {
      const opsForbidden = await ensureOpsAccess(ctx);
      if (!opsForbidden) {
        const searchNormG = q.replace(/[.\s-]/g, "");
        const guardias = await prisma.opsGuardia.findMany({
          where: {
            tenantId,
            OR: [
              { persona: { firstName: contains } },
              { persona: { lastName: contains } },
              { persona: { rut: { contains: searchNormG, mode: "insensitive" } } },
              { code: contains },
            ],
          },
          take: OPS_LIMIT,
          select: {
            id: true,
            code: true,
            persona: {
              select: { firstName: true, lastName: true, rut: true },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        for (const g of guardias) {
          results.push({
            id: g.id,
            type: "guardia",
            title: `${g.persona.firstName} ${g.persona.lastName}`.trim(),
            subtitle: g.code ? `Cód. ${g.code}` : g.persona.rut ?? "",
            href: `/personas/guardias/${g.id}`,
          });
        }
      }
    }

    // ── Documentos (por título o guardia asociado) ──
    if (hasDocs) {
      const searchNorm = q.replace(/[.\s-]/g, "");
      const guardiasByPersona = await prisma.opsGuardia.findMany({
        where: {
          tenantId,
          OR: [
            { persona: { rut: { contains: searchNorm, mode: "insensitive" } } },
            { persona: { firstName: { contains: q, mode: "insensitive" } } },
            { persona: { lastName: { contains: q, mode: "insensitive" } } },
          ],
        },
        select: { id: true },
      });
      const guardiaIds = guardiasByPersona.map((g) => g.id);

      const docsWhere: any = { tenantId };
      docsWhere.OR = [
        { title: { contains: q, mode: "insensitive" } },
        ...(guardiaIds.length > 0
          ? [{ associations: { some: { entityType: "ops_guardia", entityId: { in: guardiaIds } } } }]
          : []),
      ];

      const documents = await prisma.document.findMany({
        where: docsWhere,
        take: DOCS_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          template: { select: { name: true } },
        },
      });

      for (const doc of documents) {
        results.push({
          id: doc.id,
          type: "document",
          title: doc.title,
          subtitle: [doc.template?.name, doc.status].filter(Boolean).join(" · "),
          href: `/opai/documentos/${doc.id}`,
        });
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("Error in global search:", error);
    return NextResponse.json(
      { success: false, error: "Error en la búsqueda" },
      { status: 500 }
    );
  }
}
