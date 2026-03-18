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
  type: "lead" | "account" | "contact" | "deal" | "quote" | "installation" | "guardia" | "document" | "pauta_mensual" | "channel" | "inventory_product" | "inventory_asset" | "inventory_phone_line";
  /** Agrupa resultados por módulo para mostrar secciones separadas en la UI */
  group: "crm" | "ops" | "docs" | "chat" | "inventory";
  title: string;
  subtitle: string;
  href: string;
  /** Badge override for guardias: label + Tailwind classes (e.g. "Contratado" + "bg-emerald-500/20 text-emerald-400") */
  badgeLabel?: string;
  badgeClass?: string;
  /** Photo/logo URL for guardias (faceIdPhotoUrl) and accounts (logoUrl) - shown in search result icon */
  imageUrl?: string;
  /** PIN de marcación para guardias - siempre visible, mostrado arriba a la derecha */
  pinDisplay?: string;
};

const LIFECYCLE_BADGE: Record<string, { label: string; class: string }> = {
  postulante: { label: "Postulante", class: "bg-blue-500/20 text-blue-400" },
  seleccionado: { label: "Seleccionado", class: "bg-amber-500/20 text-amber-400" },
  contratado: { label: "Contratado", class: "bg-emerald-500/20 text-emerald-400" },
  te: { label: "TE", class: "bg-violet-500/20 text-violet-400" },
  inactivo: { label: "Inactivo", class: "bg-red-500/20 text-red-400" },
};

const CRM_TYPE_LIMIT = 6;
const OPS_LIMIT = 6;
const DOCS_LIMIT = 5;
const CHANNEL_LIMIT = 5;
const INVENTORY_LIMIT = 5;

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
            ...(isSupervisorHub ? { installations: { some: { status: "active" } } } : {}),
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
            logoUrl: true,
            notes: true,
          },
        }),
        prisma.crmContact.findMany({
          where: {
            tenantId,
            ...(isSupervisorHub
              ? { account: { installations: { some: { status: "active" } } } }
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
            portalPin: true,
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
            ...(isSupervisorHub ? { status: "active" } : {}),
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
            pairingCode: true,
            account: { select: { name: true } },
          },
        }),
      ]);

      // ── CRM results in priority order: deals → quotes → accounts → contacts → leads → installations ──

      for (const deal of deals) {
        results.push({
          id: deal.id,
          type: "deal",
          group: "crm",
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
          group: "crm",
          title: quote.code,
          subtitle: [
            `Negocio: ${dealTitle}`,
            quote.clientName,
            QUOTE_STATUS_LABEL[quote.status] || quote.status,
          ].filter(Boolean).join(" · "),
          href: `/crm/cotizaciones/${quote.id}`,
        });
      }

      const ACCOUNT_LOGO_PREFIX = "[[ACCOUNT_LOGO_URL:";
      const ACCOUNT_LOGO_SUFFIX = "]]";
      function extractAccountLogoUrl(notes: string | null | undefined): string | null {
        if (!notes) return null;
        const start = notes.indexOf(ACCOUNT_LOGO_PREFIX);
        if (start === -1) return null;
        const end = notes.indexOf(ACCOUNT_LOGO_SUFFIX, start);
        if (end === -1) return null;
        const raw = notes.slice(start + ACCOUNT_LOGO_PREFIX.length, end).trim();
        return raw || null;
      }
      const BROKEN_LOGO_PREFIX = "/uploads/company-logos/";
      function useLogoUrl(url: string | null | undefined): string | undefined {
        if (!url) return undefined;
        if (url.startsWith(BROKEN_LOGO_PREFIX)) return undefined;
        return url;
      }
      for (const acc of accounts) {
        const raw = acc.logoUrl || extractAccountLogoUrl(acc.notes) || undefined;
        const imageUrl = useLogoUrl(raw);
        results.push({
          id: acc.id,
          type: "account",
          group: "crm",
          title: acc.name,
          subtitle: [acc.type === "client" ? "Cliente" : "Prospecto", acc.industry, acc.rut]
            .filter(Boolean)
            .join(" · "),
          href: `/crm/accounts/${acc.id}`,
          imageUrl,
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
          group: "crm",
          title: `${contact.firstName} ${contact.lastName}`.trim(),
          subtitle: subtitleParts.length ? subtitleParts.join(" · ") : "Sin cuenta",
          href: `/crm/contacts/${contact.id}`,
          pinDisplay,
        });
      }

      for (const lead of leads) {
        const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
        results.push({
          id: lead.id,
          type: "lead",
          group: "crm",
          title: lead.companyName || name || "Lead sin nombre",
          subtitle: name ? `${name} · ${lead.email || ""}` : lead.email || lead.status || "",
          href: `/crm/leads/${lead.id}`,
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
        const subtitleParts = [
          inst.address,
          inst.account?.name,
          inst.pairingCode ? `Código emparejamiento: ${inst.pairingCode}` : null,
        ].filter(Boolean);
        results.push({
          id: inst.id,
          type: "installation",
          group: "crm",
          title: inst.name,
          subtitle: subtitleParts.join(" · "),
          href: `/crm/installations/${inst.id}`,
        });
        results.push({
          id: `pauta-${inst.id}`,
          type: "pauta_mensual",
          group: "ops",
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
            faceIdPhotoUrl: true,
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
          const pinDisplay = g.marcacionPinVisible
            ? `PIN: ${g.marcacionPinVisible}`
            : g.marcacionPin
              ? "Recargar para generar"
              : "Sin PIN";
          const subtitleParts = [
            g.currentInstallation?.name,
            g.persona.rut ?? "",
          ].filter(Boolean);
          const lifecycleBadge = LIFECYCLE_BADGE[g.lifecycleStatus] ?? { label: "Guardia", class: "bg-sky-400/20 text-sky-400" };
          results.push({
            id: g.id,
            type: "guardia",
            group: "ops",
            title,
            subtitle: subtitleParts.join(" · "),
            href: `/personas/guardias/${g.id}`,
            badgeLabel: hasPin ? lifecycleBadge.label : "PIN No creado",
            badgeClass: hasPin ? lifecycleBadge.class : "bg-rose-500/20 text-rose-400",
            imageUrl: g.faceIdPhotoUrl ?? undefined,
            pinDisplay,
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
          group: "docs",
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
          group: "chat",
          title: ch.name,
          subtitle,
          href: `/chat?channelId=${ch.id}`,
        });
      }
    } catch (err) {
      console.error("[global search] channel query error:", err);
      // Don't fail entire search if channel query errors
    }

    // ── Inventario (productos, activos, líneas telefónicas) ──
    if (hasOps) {
      try {
        const [invProducts, invAssets, invPhoneLines] = await Promise.all([
          prisma.inventoryProduct.findMany({
            where: {
              tenantId,
              active: true,
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
              ],
            },
            take: INVENTORY_LIMIT,
            orderBy: { createdAt: "desc" },
            select: { id: true, name: true, sku: true, category: true },
          }),
          prisma.inventoryAsset.findMany({
            where: {
              tenantId,
              OR: [
                { serialNumber: { contains: q, mode: "insensitive" } },
                { phoneNumber: { contains: q, mode: "insensitive" } },
                { notes: { contains: q, mode: "insensitive" } },
                { variant: { product: { name: { contains: q, mode: "insensitive" } } } },
              ],
            },
            take: INVENTORY_LIMIT,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              serialNumber: true,
              phoneNumber: true,
              status: true,
              variant: { select: { product: { select: { name: true } } } },
            },
          }),
          prisma.inventoryPhoneLine.findMany({
            where: {
              tenantId,
              OR: [
                { phoneNumber: { contains: q, mode: "insensitive" } },
                { label: { contains: q, mode: "insensitive" } },
                { carrier: { contains: q, mode: "insensitive" } },
              ],
            },
            take: INVENTORY_LIMIT,
            orderBy: { createdAt: "desc" },
            select: { id: true, phoneNumber: true, carrier: true, label: true, status: true },
          }),
        ]);

        const ASSET_STATUS_LABEL: Record<string, string> = {
          available: "Disponible",
          assigned: "Asignado",
          maintenance: "En mantención",
          broken: "Dañado",
          retired: "Retirado",
        };
        const INV_CATEGORY_LABEL: Record<string, string> = {
          uniform: "Uniforme",
          asset: "Activo",
        };

        for (const prod of invProducts) {
          results.push({
            id: prod.id,
            type: "inventory_product",
            group: "inventory",
            title: prod.name,
            subtitle: [INV_CATEGORY_LABEL[prod.category] ?? prod.category, prod.sku ? `SKU: ${prod.sku}` : null].filter(Boolean).join(" · "),
            href: `/ops/inventario/productos`,
          });
        }

        for (const asset of invAssets) {
          const productName = asset.variant?.product?.name ?? "Activo";
          const identifier = asset.serialNumber || asset.phoneNumber || "";
          results.push({
            id: asset.id,
            type: "inventory_asset",
            group: "inventory",
            title: productName,
            subtitle: [identifier, ASSET_STATUS_LABEL[asset.status] ?? asset.status].filter(Boolean).join(" · "),
            href: `/ops/inventario/activos`,
          });
        }

        for (const line of invPhoneLines) {
          results.push({
            id: line.id,
            type: "inventory_phone_line",
            group: "inventory",
            title: line.phoneNumber,
            subtitle: [line.carrier, line.label, line.status === "active" ? "Activa" : "Inactiva"].filter(Boolean).join(" · "),
            href: `/ops/inventario/lineas`,
          });
        }
      } catch (err) {
        console.error("[global search] inventory query error:", err);
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
