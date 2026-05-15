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
import {
  findCpqQuoteIdsBySearch,
  findCrmAccountIdsBySearch,
  findCrmContactIdsBySearch,
  findCrmDealIdsBySearch,
  findCrmDealIdsByTitleOrAccount,
  findCrmInstallationIdsBySearch,
  findCrmLeadIdsBySearch,
  findOpsGuardiaIdsBySearch,
  findOpsGuardiaIdsForDocsSearch,
} from "@/lib/search-normalize";

export type GlobalSearchResult = {
  id: string;
  type:
    | "lead"
    | "account"
    | "contact"
    | "deal"
    | "quote"
    | "installation"
    | "guardia"
    | "document"
    | "pauta_mensual"
    | "channel"
    | "inventory_product"
    | "inventory_asset"
    | "inventory_phone_line"
    | "dte_issued"
    | "dte_received";
  /** Agrupa resultados por módulo para mostrar secciones separadas en la UI */
  group: "crm" | "ops" | "docs" | "chat" | "inventory" | "finance";
  title: string;
  subtitle: string;
  href: string;
  /** Badge override for guardias: label + Tailwind classes (e.g. "Contratado" + "bg-status-ok-soft text-status-ok-fg") */
  badgeLabel?: string;
  badgeClass?: string;
  /** Photo/logo URL for guardias (faceIdPhotoUrl) and accounts (logoUrl) - shown in search result icon */
  imageUrl?: string;
  /** PIN de marcación para guardias - siempre visible, mostrado arriba a la derecha */
  pinDisplay?: string;
};

const LIFECYCLE_BADGE: Record<string, { label: string; class: string }> = {
  postulante: { label: "Postulante", class: "bg-status-info-soft text-status-info-fg" },
  seleccionado: { label: "Seleccionado", class: "bg-status-warn-soft text-status-warn-fg" },
  contratado: { label: "Contratado", class: "bg-status-ok-soft text-status-ok-fg" },
  te: { label: "TE", class: "bg-violet-500/20 text-violet-400" },
  inactivo: { label: "Inactivo", class: "bg-status-danger-soft text-status-danger-fg" },
};

const CRM_TYPE_LIMIT = 10;
const OPS_LIMIT = 10;
const DOCS_LIMIT = 8;
const CHANNEL_LIMIT = 8;
const INVENTORY_LIMIT = 8;
const FINANCE_LIMIT = 10;

const DTE_TYPE_LABEL: Record<number, string> = {
  33: "Factura",
  34: "Fact. Exenta",
  39: "Boleta",
  41: "Boleta Exenta",
  43: "Liquidación",
  46: "Fact. Compra",
  52: "Guía Despacho",
  56: "Nota Débito",
  61: "Nota Crédito",
  110: "Fact. Exportación",
  111: "ND Exportación",
  112: "NC Exportación",
};

const DTE_SII_STATUS_BADGE: Record<string, { label: string; class: string }> = {
  DRAFT:           { label: "Borrador",       class: "bg-muted text-muted-foreground" },
  PENDING:         { label: "SII Pendiente",  class: "bg-status-warn-soft text-status-warn-fg" },
  SENT:            { label: "SII Enviado",    class: "bg-tint-sky text-tint-sky-fg" },
  ACCEPTED:        { label: "SII Aceptado",   class: "bg-status-ok-soft text-status-ok-fg" },
  WITH_OBJECTIONS: { label: "Con Reparos",    class: "bg-status-warn-soft text-status-warn-fg" },
  REJECTED:        { label: "SII Rechazado",  class: "bg-status-danger-soft text-status-danger-fg" },
  ANNULLED:        { label: "Anulado",        class: "bg-status-danger-soft text-status-danger-fg" },
};

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

    const isSupervisorHub = ctx.userRole?.toLowerCase() === "supervisor";

    const tenantId = ctx.tenantId;
    const results: GlobalSearchResult[] = [];

    // ── CRM (leads, accounts, contacts, deals, quotes, installations) ──
    if (hasCrm) {
      try {
      // IDs de negocios (deals) cuyo título o nombre de cuenta coincide, para
      // incluir sus cotizaciones. La búsqueda es accent-insensitive (f_unaccent).
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

      // Resolución en dos pasos: primero IDs vía SQL normalizado, luego hidratación
      // con findMany para conservar selects/relaciones de Prisma.
      const [leadIds, accountIds, contactIds, dealIds, quoteIds, installationIds] =
        await Promise.all([
          findCrmLeadIdsBySearch({ tenantId, query: q, limit: CRM_TYPE_LIMIT }),
          findCrmAccountIdsBySearch({
            tenantId,
            query: q,
            limit: CRM_TYPE_LIMIT,
            onlySupervisorScope: isSupervisorHub,
          }),
          findCrmContactIdsBySearch({
            tenantId,
            query: q,
            limit: CRM_TYPE_LIMIT,
            onlySupervisorScope: isSupervisorHub,
          }),
          findCrmDealIdsBySearch({ tenantId, query: q, limit: CRM_TYPE_LIMIT }),
          findCpqQuoteIdsBySearch({
            tenantId,
            query: q,
            limit: CRM_TYPE_LIMIT,
            extraDealIds: dealIdsForQuotes,
            extraQuoteIds: quoteIdsFromDealLinks,
          }),
          findCrmInstallationIdsBySearch({
            tenantId,
            query: q,
            limit: CRM_TYPE_LIMIT,
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
                logoUrl: true,
                notes: true,
              },
            })
          : Promise.resolve([] as Array<{ id: string; name: string; type: string; industry: string | null; rut: string | null; logoUrl: string | null; notes: string | null }>),
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
                pairingCode: true,
                account: { select: { name: true } },
              },
            })
          : Promise.resolve([] as Array<{ id: string; name: string; address: string | null; pairingCode: string | null; account: { name: string } | null }>),
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
        const quoteName = quote.name?.trim();
        results.push({
          id: quote.id,
          type: "quote",
          group: "crm",
          title: quoteName ? `${quote.code} · ${quoteName}` : quote.code,
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
      } catch (crmErr) {
        console.error("[global search] CRM query error:", crmErr);
      }
    }

    // ── Ops (guardias por nombre, código, RUT) — accent-insensitive ──
    if (hasOps) {
      try {
      const opsForbidden = await ensureOpsAccess(ctx);
      if (!opsForbidden) {
        const guardiaIds = await findOpsGuardiaIdsBySearch({
          tenantId,
          query: q,
          limit: OPS_LIMIT,
        });
        const guardias = guardiaIds.length > 0
          ? await prisma.opsGuardia.findMany({
              where: { tenantId, id: { in: guardiaIds } },
              select: {
                id: true,
                code: true,
                lifecycleStatus: true,
                availableExtraShifts: true,
                marcacionPin: true,
                marcacionPinVisible: true,
                faceIdPhotoUrl: true,
                persona: {
                  select: { firstName: true, lastName: true, rut: true },
                },
                currentInstallation: { select: { name: true } },
              },
              orderBy: { createdAt: "desc" },
            })
          : [];

        for (const g of guardias) {
          const primerNombre = g.persona.firstName?.trim().split(/\s+/)[0] ?? "";
          const apellidos = g.persona.lastName?.trim() ?? "";
          const title = apellidos ? `${apellidos}${primerNombre ? `, ${primerNombre}` : ""}` : (g.persona.firstName ?? "").trim() || "Guardia";
          const pinDisplay = g.marcacionPinVisible
            ? `PIN: ${g.marcacionPinVisible}`
            : g.marcacionPin
              ? "PIN configurado"
              : "Sin PIN";
          const subtitleParts = [
            g.currentInstallation?.name,
            g.persona.rut ?? "",
          ].filter(Boolean);
          // Badge de tipo: Contratado | Turno Extra | (lo que diga lifecycle)
          // El badge ahora siempre muestra el tipo de guardia, no el estado del PIN
          // (el PIN se muestra en pinDisplay arriba a la derecha).
          let tipoBadge: { label: string; class: string };
          if (g.lifecycleStatus === "contratado") {
            tipoBadge = { label: "Contratado", class: "bg-status-info-soft text-status-info-fg" };
          } else if (g.lifecycleStatus === "te") {
            tipoBadge = { label: "Turno Extra", class: "bg-purple-500/20 text-purple-400" };
          } else {
            tipoBadge = LIFECYCLE_BADGE[g.lifecycleStatus] ?? { label: "Guardia", class: "bg-sky-400/20 text-status-info-fg" };
          }
          results.push({
            id: g.id,
            type: "guardia",
            group: "ops",
            title,
            subtitle: subtitleParts.join(" · "),
            href: `/personas/guardias/${g.id}`,
            badgeLabel: tipoBadge.label,
            badgeClass: tipoBadge.class,
            imageUrl: g.faceIdPhotoUrl ?? undefined,
            pinDisplay,
          });
        }
      }
      } catch (opsErr) {
        console.error("[global search] Ops (guardias) query error:", opsErr);
      }
    }

    // ── Documentos (por título o guardia asociado) — accent-insensitive ──
    if (hasDocs) {
      try {
      const guardiaIds = await findOpsGuardiaIdsForDocsSearch({ tenantId, query: q });

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
      } catch (docsErr) {
        console.error("[global search] docs query error:", docsErr);
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
          href: `/chat?channel=${ch.id}`,
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

        // El command palette debe aterrizar en el ítem elegido, no en el
        // listado genérico. Pasamos `?openId=` y los clientes de inventario
        // lo usan para abrir edición (productos/líneas) o resaltar fila
        // (activos).
        for (const prod of invProducts) {
          results.push({
            id: prod.id,
            type: "inventory_product",
            group: "inventory",
            title: prod.name,
            subtitle: [INV_CATEGORY_LABEL[prod.category] ?? prod.category, prod.sku ? `SKU: ${prod.sku}` : null].filter(Boolean).join(" · "),
            href: `/ops/inventario/productos?openId=${prod.id}`,
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
            href: `/ops/inventario/activos?openId=${asset.id}`,
          });
        }

        for (const line of invPhoneLines) {
          results.push({
            id: line.id,
            type: "inventory_phone_line",
            group: "inventory",
            title: line.phoneNumber,
            subtitle: [line.carrier, line.label, line.status === "active" ? "Activa" : "Inactiva"].filter(Boolean).join(" · "),
            href: `/ops/inventario/lineas?openId=${line.id}`,
          });
        }
      } catch (err) {
        console.error("[global search] inventory query error:", err);
      }
    }

    // ── Finanzas: DTE emitidos y recibidos (folio, RUT, monto, nombre receptor/emisor) ──
    const hasFinance = hasModuleAccess(perms, "finance");
    if (hasFinance) {
      try {
        // Normalizamos el query para poder buscar folio numérico y RUT sin puntos/guiones.
        const folioCandidate = Number.parseInt(q.replace(/\D/g, ""), 10);
        const folioFilter: Array<Record<string, unknown>> = Number.isFinite(folioCandidate) && folioCandidate > 0
          ? [{ folio: folioCandidate }]
          : [];
        // Monto exacto: si el usuario escribe un número grande (más de 4 dígitos)
        // lo consideramos un monto bruto. Match exacto a totalAmount.
        const amountFilter: Array<Record<string, unknown>> = Number.isFinite(folioCandidate) && folioCandidate > 9999
          ? [{ totalAmount: folioCandidate }]
          : [];
        const rutSearch = q.replace(/[.\s-]/g, "");
        const dteContains = { contains: q, mode: "insensitive" as const };

        const dteOr: Array<Record<string, unknown>> = [
          ...folioFilter,
          ...amountFilter,
          { code: dteContains },
          { receiverName: dteContains },
          { issuerName: dteContains },
          { receiverRut: { contains: rutSearch, mode: "insensitive" } },
          { issuerRut: { contains: rutSearch, mode: "insensitive" } },
        ];

        const [dtes] = await Promise.all([
          prisma.financeDte.findMany({
            where: { tenantId, OR: dteOr as never },
            take: FINANCE_LIMIT * 2,
            orderBy: [{ date: "desc" }],
            select: {
              id: true,
              direction: true,
              dteType: true,
              folio: true,
              code: true,
              date: true,
              issuerName: true,
              issuerRut: true,
              receiverName: true,
              receiverRut: true,
              totalAmount: true,
              currency: true,
              siiStatus: true,
            },
          }),
        ]);

        for (const d of dtes) {
          const isIssued = d.direction === "ISSUED";
          const tipo = DTE_TYPE_LABEL[d.dteType] ?? `DTE ${d.dteType}`;
          const counterpartyName = isIssued ? d.receiverName : d.issuerName;
          const counterpartyRut = isIssued ? d.receiverRut : d.issuerRut;
          const totalNumber = Number(d.totalAmount);
          const montoFmt =
            d.currency === "CLP"
              ? `$${totalNumber.toLocaleString("es-CL")}`
              : `${d.currency} ${totalNumber.toLocaleString("es-CL")}`;
          const fechaFmt = d.date.toLocaleDateString("es-CL", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          });
          const badge = DTE_SII_STATUS_BADGE[d.siiStatus];

          results.push({
            id: d.id,
            type: isIssued ? "dte_issued" : "dte_received",
            group: "finance",
            title: `${tipo} #${d.folio} · ${counterpartyName || "Sin receptor"}`,
            subtitle: [counterpartyRut, montoFmt, fechaFmt]
              .filter(Boolean)
              .join(" · "),
            // Usamos `openDteId` (no `id`) porque los clientes de DTEs
            // emitidos/recibidos abren el slide-over de detalle leyendo ese
            // search param. Con `?id=` la página solo se cargaba sin
            // navegar al documento elegido desde el command palette.
            href: isIssued
              ? `/finanzas/facturacion/dtes?openDteId=${d.id}`
              : `/finanzas/facturacion/recibidos?openDteId=${d.id}`,
            badgeLabel: badge?.label,
            badgeClass: badge?.class,
          });
        }
      } catch (err) {
        console.error("[global search] finance DTE query error:", err);
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
