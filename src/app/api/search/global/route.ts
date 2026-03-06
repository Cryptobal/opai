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
  type: "lead" | "account" | "contact" | "deal" | "quote" | "installation" | "guardia" | "document" | "pauta_mensual" | "channel";
  title: string;
  subtitle: string;
  href: string;
  /** Badge override for guardias: label + Tailwind classes (e.g. "Contratado" + "bg-emerald-500/20 text-emerald-400") */
  badgeLabel?: string;
  badgeClass?: string;
};

const LIFECYCLE_BADGE: Record<string, { label: string; class: string }> = {
  postulante: { label: "Postulante", class: "bg-blue-500/20 text-blue-400" },
  seleccionado: { label: "Seleccionado", class: "bg-amber-500/20 text-amber-400" },
  contratado: { label: "Contratado", class: "bg-emerald-500/20 text-emerald-400" },
  te: { label: "TE", class: "bg-violet-500/20 text-violet-400" },
  inactivo: { label: "Inactivo", class: "bg-red-500/20 text-red-400" },
};

const CRM_TYPE_LIMIT = 4;
const OPS_LIMIT = 6;
const DOCS_LIMIT = 5;
const CHANNEL_LIMIT = 5;

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
    if (!q || q.length < 1) {
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
      // IDs de negocios (deals) cuyo título o nombre de cuenta coincide, para incluir sus cotizaciones
      const dealIdsByTitleOrAccount = await prisma.crmDeal.findMany({
        where: {
          tenantId,
          OR: [
            { title: contains },
            { account: { name: contains } },
          ],
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
            portalPinVisible: true,
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
            OR: [
              { code: contains },
              { clientName: contains },
              { notes: contains },
              ...(dealIdsForQuotes.length > 0 ? [{ dealId: { in: dealIdsForQuotes } }] : []),
              ...(quoteIdsFromDealLinks.length > 0 ? [{ id: { in: quoteIdsFromDealLinks } }] : []),
            ],
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
        const subtitleParts = [contact.account?.name, contact.portalPinVisible ? `PIN: ${contact.portalPinVisible}` : null].filter(Boolean);
        results.push({
          id: contact.id,
          type: "contact",
          title: `${contact.firstName} ${contact.lastName}`.trim(),
          subtitle: subtitleParts.length ? subtitleParts.join(" · ") : "Sin cuenta",
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
      const MESES_GLOBAL = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
      ];
      const now = new Date();
      const curMonth = now.getMonth() + 1;
      const curYear = now.getFullYear();

      for (const inst of installations) {
        results.push({
          id: inst.id,
          type: "installation",
          title: inst.name,
          subtitle: [inst.address, inst.account?.name].filter(Boolean).join(" · "),
          href: `/crm/installations/${inst.id}`,
        });
        results.push({
          id: `pauta-${inst.id}`,
          type: "pauta_mensual",
          title: `Pauta mensual · ${inst.name}`,
          subtitle: [
            `${MESES_GLOBAL[curMonth - 1]} ${curYear}`,
            inst.account?.name,
          ].filter(Boolean).join(" · "),
          href: `/ops/pauta-mensual?installationId=${inst.id}`,
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
            lifecycleStatus: true,
            marcacionPin: true,
            marcacionPinVisible: true,
            persona: {
              select: { firstName: true, lastName: true, rut: true },
            },
            currentInstallation: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        for (const g of guardias) {
          const primerNombre = g.persona.firstName?.trim().split(/\s+/)[0] ?? "";
          const apellidos = g.persona.lastName?.trim() ?? "";
          const title = apellidos ? `${apellidos}${primerNombre ? `, ${primerNombre}` : ""}` : (g.persona.firstName ?? "").trim() || "Guardia";
          const hasPin = Boolean(g.marcacionPin || g.marcacionPinVisible);
          const pinText = g.marcacionPinVisible
            ? `PIN: ${g.marcacionPinVisible}`
            : g.marcacionPin
              ? "PIN: Configurado"
              : "";
          const subtitleParts = [
            g.currentInstallation?.name,
            g.persona.rut ?? "",
            pinText,
          ].filter(Boolean);
          const lifecycleBadge = LIFECYCLE_BADGE[g.lifecycleStatus] ?? { label: "Guardia", class: "bg-sky-400/20 text-sky-400" };
          results.push({
            id: g.id,
            type: "guardia",
            title,
            subtitle: subtitleParts.join(" · "),
            href: `/personas/guardias/${g.id}`,
            badgeLabel: hasPin ? lifecycleBadge.label : "PIN No creado",
            badgeClass: hasPin ? lifecycleBadge.class : "bg-rose-500/20 text-rose-400",
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

    // ── Chat channels ──
    try {
      const channels = await prisma.chatChannel.findMany({
        where: {
          tenantId,
          isActive: true,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { installation: { name: { contains: q, mode: "insensitive" } } },
          ],
        },
        take: CHANNEL_LIMIT,
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true,
          name: true,
          channelType: true,
          installation: { select: { name: true } },
        },
      });

      for (const ch of channels) {
        const subtitle =
          ch.channelType === "INSTALLATION" && ch.installation
            ? `Instalación · ${ch.installation.name}`
            : ch.channelType === "DIRECT"
              ? "Mensaje directo"
              : "Grupo";
        results.push({
          id: ch.id,
          type: "channel",
          title: ch.name,
          subtitle,
          href: `/chat?channelId=${ch.id}`,
        });
      }
    } catch (err) {
      console.error("[global search] channel query error:", err);
      // Don't fail entire search if channel query errors
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
