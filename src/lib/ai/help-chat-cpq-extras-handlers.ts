/**
 * Tools CPQ "extras" para el asistente IA — líneas ADICIONALES de la cotización
 * (costos extra, uniformes, exámenes) y edición general de la cotización.
 *
 * Replica el patrón de permisos/log/recálculo de `/api/cpq/quotes/[id]/costs`
 * y `/api/cpq/quotes/[id]` (PATCH). Cada escritura recalcula los totales de la
 * cotización con `computeCpqQuoteCosts` — igual que la ruta HTTP de costos — para
 * que `monthlyCost`/`totalGuards` no queden desactualizados.
 */
import type { HelpChatPageContext } from "@/lib/ai/help-chat-page-context";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { RolePermissions } from "@/lib/permissions";
import {
  hcAiLog,
  hcCanReadQuotes,
  hcCanWriteQuotes,
  hcMapQuoteResolveError,
} from "@/lib/ai/help-chat-cpq-ai-shared";
import { resolveAiHelpChatCpqQuote } from "@/lib/ai/help-chat-ai-cpq-quote";
import { resolveContactIdForCpqQuote } from "@/lib/ai/resolve-quote-contact";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { isUuid } from "@/lib/utils/uuid";

type PageCx = HelpChatPageContext | null | undefined;

function asStr(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" ? v.trim() || undefined : undefined;
}
function numArg(o: Record<string, unknown>, k: string): number | undefined {
  const v = o[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/**
 * Recalcula y persiste los totales de la cotización tras editar sus líneas.
 * Idéntico al bloque de recálculo del PUT `/api/cpq/quotes/[id]/costs`.
 */
export async function recomputeQuoteTotals(quoteId: string) {
  const [totalPositions, summary] = await Promise.all([
    prisma.cpqPosition.count({ where: { quoteId } }),
    computeCpqQuoteCosts(quoteId),
  ]);
  await prisma.cpqQuote.update({
    where: { id: quoteId },
    data: {
      totalPositions,
      totalGuards: summary.totalGuards,
      monthlyCost: summary.monthlyTotal,
    },
  });
  return summary;
}

/** Lee las líneas adicionales persistidas de la cotización, agrupadas por kind. */
async function listExtras(quoteId: string) {
  const [costs, uniforms, exams] = await Promise.all([
    prisma.cpqQuoteCostItem.findMany({
      where: { quoteId },
      include: { catalogItem: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.cpqQuoteUniformItem.findMany({
      where: { quoteId },
      include: { catalogItem: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.cpqQuoteExamItem.findMany({
      where: { quoteId },
      include: { catalogItem: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const costUnit = (c: (typeof costs)[number]) =>
    c.isAmortizable && c.investmentAmount != null
      ? Number(c.investmentAmount)
      : c.unitPriceOverride != null
        ? Number(c.unitPriceOverride)
        : Number(c.catalogItem?.basePrice ?? 0);
  return {
    cost: costs.map((c) => ({
      itemId: c.id,
      name: c.customName ?? c.catalogItem?.name ?? "(sin nombre)",
      quantity: Number(c.quantity),
      unitPrice: costUnit(c),
      recurring: !c.isAmortizable,
      enabled: c.isEnabled,
    })),
    uniform: uniforms.map((u) => ({
      itemId: u.id,
      name: u.catalogItem?.name ?? "(uniforme)",
      unitPrice:
        u.unitPriceOverride != null
          ? Number(u.unitPriceOverride)
          : Number(u.catalogItem?.basePrice ?? 0),
      active: u.active,
    })),
    exam: exams.map((e) => ({
      itemId: e.id,
      name: e.catalogItem?.name ?? "(examen)",
      unitPrice:
        e.unitPriceOverride != null
          ? Number(e.unitPriceOverride)
          : Number(e.catalogItem?.basePrice ?? 0),
      active: e.active,
    })),
  };
}

/**
 * Resuelve un ítem de catálogo (uniform/exam) por nombre dentro del tenant o
 * globales; si no existe crea uno tenant-scoped (replica el path savedToCatalog
 * del PUT de costos). Devuelve el ítem de catálogo a vincular.
 */
async function resolveCatalogItemForKind(
  tenantId: string,
  type: "uniform" | "exam",
  name: string,
  unitPrice: number | undefined,
) {
  const nm = name.trim();
  const exactTenant = await prisma.cpqCatalogItem.findFirst({
    where: { type, active: true, tenantId, name: { equals: nm, mode: "insensitive" } },
  });
  if (exactTenant) return exactTenant;
  const exactGlobal = await prisma.cpqCatalogItem.findFirst({
    where: { type, active: true, tenantId: null, name: { equals: nm, mode: "insensitive" } },
  });
  if (exactGlobal) return exactGlobal;
  const partial = await prisma.cpqCatalogItem.findFirst({
    where: {
      type,
      active: true,
      OR: [{ tenantId }, { tenantId: null }],
      name: { contains: nm, mode: "insensitive" },
    },
    orderBy: { createdAt: "asc" },
  });
  if (partial) return partial;
  return prisma.cpqCatalogItem.create({
    data: {
      tenantId,
      type,
      name: nm.slice(0, 200),
      unit: type === "uniform" ? "uniforme" : "examen",
      basePrice: unitPrice ?? 0,
      isDefault: false,
      active: true,
    },
  });
}

export async function aiTool_manage_quote_extras(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  const TOOL = "manage_quote_extras";
  const action = typeof args.action === "string" ? args.action.trim().toLowerCase() : "";
  const kind = typeof args.kind === "string" ? args.kind.trim().toLowerCase() : "";
  const isWrite = action !== "list";

  if (isWrite ? !hcCanWriteQuotes(perms) : !hcCanReadQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso para editar cotizaciones." };
  }

  const val = async (msg: string, code: string) => {
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "validation_error", errorMessage: code, startedAt: t0 });
    return { ok: false as const, error: msg };
  };

  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);

    if (action === "list") {
      const extras = await listExtras(quote.id);
      await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "success", resultEntityId: quote.id, resultEntityType: "cpq_quote", startedAt: t0 });
      return { ok: true, data: { quoteId: quote.id, quoteCode: quote.code, extras } };
    }

    if (!new Set(["add", "update", "remove"]).has(action)) {
      return await val("Acción inválida. Usa action: list | add | update | remove.", "action");
    }
    if (!new Set(["cost", "uniform", "exam"]).has(kind)) {
      return await val("Indica kind: cost (costo/equipamiento), uniform o exam.", "kind");
    }

    if (kind === "cost") {
      if (action === "add") {
        const name = asStr(args, "name");
        const unitPrice = numArg(args, "unitPrice");
        if (!name) return await val("Indica name del adicional (ej. 'Cámaras CCTV').", "name");
        if (unitPrice == null) return await val("Indica unitPrice (CLP) del adicional.", "unitPrice");
        const quantity = numArg(args, "quantity") ?? 1;
        const recurring = typeof args.recurring === "boolean" ? args.recurring : true;
        await prisma.cpqQuoteCostItem.create({
          data: {
            quoteId: quote.id,
            catalogItemId: null,
            customName: name.slice(0, 200),
            customType: "equipment",
            customCategory: "adicional",
            calcMode: "per_month",
            quantity,
            unitPriceOverride: recurring ? unitPrice : null,
            isEnabled: true,
            visibility: "visible",
            isAmortizable: !recurring,
            investmentAmount: recurring ? null : unitPrice,
            amortizationMonths: null,
          },
        });
      } else {
        const itemId = asStr(args, "itemId");
        if (!itemId) return await val("Indica itemId del adicional (usa action=list para verlo).", "itemId");
        const existing = await prisma.cpqQuoteCostItem.findFirst({ where: { id: itemId, quoteId: quote.id } });
        if (!existing) return await val("No encontré ese adicional en la cotización.", "notfound");
        if (action === "remove") {
          await prisma.cpqQuoteCostItem.deleteMany({ where: { id: itemId, quoteId: quote.id } });
        } else {
          const data: Prisma.CpqQuoteCostItemUpdateManyMutationInput = {};
          const name = asStr(args, "name");
          if (name) data.customName = name.slice(0, 200);
          const quantity = numArg(args, "quantity");
          if (quantity != null) data.quantity = quantity;
          const unitPrice = numArg(args, "unitPrice");
          const recurring = typeof args.recurring === "boolean" ? args.recurring : undefined;
          if (recurring !== undefined) {
            data.isAmortizable = !recurring;
            if (recurring) {
              data.investmentAmount = null;
              data.unitPriceOverride = unitPrice ?? (existing.unitPriceOverride ?? existing.investmentAmount ?? null);
            } else {
              data.unitPriceOverride = null;
              data.investmentAmount = unitPrice ?? (existing.investmentAmount ?? existing.unitPriceOverride ?? null);
            }
          } else if (unitPrice != null) {
            if (existing.isAmortizable) data.investmentAmount = unitPrice;
            else data.unitPriceOverride = unitPrice;
          }
          await prisma.cpqQuoteCostItem.updateMany({ where: { id: itemId, quoteId: quote.id }, data });
        }
      }
    } else {
      // uniform | exam — vinculados a un ítem de catálogo (catalogItemId requerido)
      const type = kind as "uniform" | "exam";
      if (action === "add") {
        const name = asStr(args, "name");
        if (!name) return await val(`Indica name del ${type === "uniform" ? "uniforme" : "examen"}.`, "name");
        const unitPrice = numArg(args, "unitPrice");
        const catalogItem = await resolveCatalogItemForKind(tenantId, type, name, unitPrice);
        if (type === "uniform") {
          const dup = await prisma.cpqQuoteUniformItem.findFirst({ where: { quoteId: quote.id, catalogItemId: catalogItem.id } });
          if (dup) {
            await prisma.cpqQuoteUniformItem.updateMany({
              where: { id: dup.id, quoteId: quote.id },
              data: { unitPriceOverride: unitPrice ?? dup.unitPriceOverride, active: true },
            });
          } else {
            await prisma.cpqQuoteUniformItem.create({
              data: { quoteId: quote.id, catalogItemId: catalogItem.id, unitPriceOverride: unitPrice ?? null, active: true },
            });
          }
        } else {
          const dup = await prisma.cpqQuoteExamItem.findFirst({ where: { quoteId: quote.id, catalogItemId: catalogItem.id } });
          if (dup) {
            await prisma.cpqQuoteExamItem.updateMany({
              where: { id: dup.id, quoteId: quote.id },
              data: { unitPriceOverride: unitPrice ?? dup.unitPriceOverride, active: true },
            });
          } else {
            await prisma.cpqQuoteExamItem.create({
              data: { quoteId: quote.id, catalogItemId: catalogItem.id, unitPriceOverride: unitPrice ?? null, active: true },
            });
          }
        }
      } else {
        const itemId = asStr(args, "itemId");
        if (!itemId) return await val(`Indica itemId del ${type === "uniform" ? "uniforme" : "examen"} (usa action=list).`, "itemId");
        if (type === "uniform") {
          const existing = await prisma.cpqQuoteUniformItem.findFirst({ where: { id: itemId, quoteId: quote.id } });
          if (!existing) return await val("No encontré ese uniforme en la cotización.", "notfound");
          if (action === "remove") {
            await prisma.cpqQuoteUniformItem.deleteMany({ where: { id: itemId, quoteId: quote.id } });
          } else {
            const unitPrice = numArg(args, "unitPrice");
            if (unitPrice == null) return await val("Indica unitPrice para actualizar el uniforme.", "unitPrice");
            await prisma.cpqQuoteUniformItem.updateMany({ where: { id: itemId, quoteId: quote.id }, data: { unitPriceOverride: unitPrice } });
          }
        } else {
          const existing = await prisma.cpqQuoteExamItem.findFirst({ where: { id: itemId, quoteId: quote.id } });
          if (!existing) return await val("No encontré ese examen en la cotización.", "notfound");
          if (action === "remove") {
            await prisma.cpqQuoteExamItem.deleteMany({ where: { id: itemId, quoteId: quote.id } });
          } else {
            const unitPrice = numArg(args, "unitPrice");
            if (unitPrice == null) return await val("Indica unitPrice para actualizar el examen.", "unitPrice");
            await prisma.cpqQuoteExamItem.updateMany({ where: { id: itemId, quoteId: quote.id }, data: { unitPriceOverride: unitPrice } });
          }
        }
      }
    }

    const summary = await recomputeQuoteTotals(quote.id);
    const extras = await listExtras(quote.id);
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "success", resultEntityId: quote.id, resultEntityType: "cpq_quote", startedAt: t0 });
    return {
      ok: true,
      data: { quoteId: quote.id, quoteCode: quote.code, action, kind, monthlyTotal: summary.monthlyTotal, extras },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "internal_error", errorMessage: raw, startedAt: t0 });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}

/**
 * Edita campos GENERALES/comerciales de una cotización (nombre, cliente, validez,
 * notas, condiciones de pago, inicio y duración de servicio). Replica el mapeo del
 * PATCH `/api/cpq/quotes/[id]` (subset comercial; no toca puestos/margen/estado/CRM).
 */
export async function aiTool_update_quote(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  const TOOL = "update_quote";
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso para editar cotizaciones." };
  }
  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);

    const data: Prisma.CpqQuoteUpdateManyMutationInput = {};
    const has = (k: string) => Object.prototype.hasOwnProperty.call(args, k) && args[k] !== undefined;

    if (has("name")) data.name = asStr(args, "name") ?? null;
    if (has("clientName")) data.clientName = asStr(args, "clientName") ?? null;
    if (has("notes")) data.notes = asStr(args, "notes") ?? null;
    if (has("paymentTerms")) data.paymentTerms = asStr(args, "paymentTerms") ?? "contrafactura";
    if (has("serviceStartDays")) data.serviceStartDays = numArg(args, "serviceStartDays") ?? 5;
    if (has("contractDuration")) data.contractDuration = numArg(args, "contractDuration") ?? 12;
    if (has("isOngoingService")) data.isOngoingService = Boolean(args.isOngoingService);
    if (has("validUntil")) {
      const raw = asStr(args, "validUntil");
      if (!raw) {
        data.validUntil = null;
      } else {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) {
          await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "validation_error", errorMessage: "validUntil", startedAt: t0 });
          return { ok: false, error: "validUntil inválida. Usa formato YYYY-MM-DD." };
        }
        data.validUntil = d;
      }
    }
    if (has("contactId")) {
      const rawContactId = asStr(args, "contactId");
      if (!rawContactId) {
        await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "validation_error", errorMessage: "contactId vacío", startedAt: t0 });
        return { ok: false, error: "contactId no puede quedar vacío. Pasa el UUID del contacto (search_contacts)." };
      }
      if (!isUuid(rawContactId)) {
        await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "validation_error", errorMessage: "contactId inválido", startedAt: t0 });
        return { ok: false, error: "El contactId no tiene formato válido. Usa search_contacts." };
      }
      const full = await prisma.cpqQuote.findFirst({
        where: { id: quote.id, tenantId },
        select: { accountId: true },
      });
      if (!full?.accountId) {
        await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "validation_error", errorMessage: "quote sin account", startedAt: t0 });
        return { ok: false, error: "La cotización no tiene cuenta asociada; no se puede validar el contacto." };
      }
      const resolved = await resolveContactIdForCpqQuote({
        tenantId,
        accountId: full.accountId,
        explicitContactId: rawContactId,
      });
      if (!resolved.ok) {
        await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "validation_error", errorMessage: resolved.error, startedAt: t0 });
        return { ok: false, error: resolved.error };
      }
      data.contactId = resolved.contactId;
    }

    if (Object.keys(data).length === 0) {
      await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "validation_error", errorMessage: "nofields", startedAt: t0 });
      return { ok: false, error: "Indica al menos un campo a cambiar (name, clientName, contactId, validUntil, notes, paymentTerms, serviceStartDays, contractDuration, isOngoingService)." };
    }

    const res = await prisma.cpqQuote.updateMany({ where: { id: quote.id, tenantId }, data });
    if (res.count !== 1) throw new Error("QUOTE_NOT_FOUND");

    const updated = await prisma.cpqQuote.findFirst({
      where: { id: quote.id, tenantId },
      select: {
        id: true, code: true, name: true, clientName: true, contactId: true, validUntil: true, notes: true,
        paymentTerms: true, serviceStartDays: true, contractDuration: true, isOngoingService: true,
      },
    });
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "success", resultEntityId: quote.id, resultEntityType: "cpq_quote", startedAt: t0 });
    return { ok: true, data: { ...updated, changedFields: Object.keys(data) } };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "internal_error", errorMessage: raw, startedAt: t0 });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}

/** Normaliza un teléfono chileno a dígitos con prefijo país para wa.me (mismo criterio que el módulo de envío). */
function normalizeWaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  if (/^9\d{8}$/.test(cleaned)) return `56${cleaned}`;
  if (cleaned.startsWith("+")) return cleaned.slice(1);
  return cleaned;
}

/**
 * Devuelve el link vigente del portal cliente de una cotización YA ENVIADA
 * (deal.proposalLink) para compartirlo por WhatsApp. NO envía nada ni genera
 * invitaciones nuevas. Lectura: solo dispatcher.
 */
export async function aiTool_get_quote_share_link(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  const TOOL = "get_quote_share_link";
  if (!hcCanReadQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso para ver cotizaciones." };
  }
  try {
    const resolved = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: resolved.id, tenantId },
      select: { id: true, code: true, clientName: true, dealId: true, contactId: true },
    });
    if (!quote) throw new Error("QUOTE_NOT_FOUND");

    // dealId/contactId son escalares (CPQ y CRM en schemas distintos) → lookups tenant-scoped.
    const deal = quote.dealId
      ? await prisma.crmDeal.findFirst({ where: { id: quote.dealId, tenantId }, select: { title: true, proposalLink: true } })
      : null;
    const portalUrl = deal?.proposalLink ?? null;
    if (!portalUrl) {
      await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "validation_error", errorMessage: "not_sent", startedAt: t0 });
      return {
        ok: false,
        error: "Esta cotización todavía no tiene link de portal (no se ha enviado). Envíala primero con send_quote_proposal y luego te doy el link listo para WhatsApp.",
      };
    }

    const contact = quote.contactId
      ? await prisma.crmContact.findFirst({ where: { id: quote.contactId, tenantId }, select: { firstName: true, lastName: true, phone: true } })
      : null;
    const clientName =
      quote.clientName ??
      (contact ? `${contact.firstName} ${contact.lastName}`.trim() : null);
    const message = `Hola, te comparto nuestra propuesta de servicios de seguridad: ${portalUrl}`;
    const phone = normalizeWaPhone(contact?.phone);
    const whatsappUrl = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "success", resultEntityId: quote.id, resultEntityType: "cpq_quote", startedAt: t0 });
    return {
      ok: true,
      data: {
        quoteId: quote.id,
        quoteCode: quote.code,
        portalUrl,
        dealTitle: deal?.title ?? null,
        clientName,
        whatsappPhone: phone,
        whatsappUrl,
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "internal_error", errorMessage: raw, startedAt: t0 });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}
