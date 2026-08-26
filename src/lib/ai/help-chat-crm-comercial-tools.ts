/**
 * Tools MCP / help-chat para Comercial: leads + deshacer altas (deal/quote).
 * Wrappers sobre los mismos servicios que la UI
 * (`executeQuoteDelete`, `executeDealDelete`, `executeLeadDelete`,
 * `approveLead`, `rejectLead`). Mutaciones: preview_* → confirm=true + previewToken.
 */

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storePreview, consumePreview, type CrmComercialPersistToolName } from "@/lib/ai/dte-preview-cache";
import { resolveQuoteByCodeOrName } from "@/lib/ai/help-chat-resolvers";
import { isUuid } from "@/lib/utils/uuid";
import {
  canDelete,
  canEdit,
  canView,
  type RolePermissions,
} from "@/lib/permissions";
import { buildDealDeleteImpact, buildQuoteDeleteImpact } from "@/modules/cpq/quote-delete-impact";
import { executeQuoteDelete } from "@/modules/cpq/delete-quote.service";
import { executeDealDelete } from "@/modules/crm/delete-deal.service";
import {
  DELETABLE_LEAD_STATUSES,
  executeLeadDelete,
  leadDisplayName,
} from "@/modules/crm/leads/delete-lead.service";
import { approveLead } from "@/modules/crm/leads/approve-lead.service";
import { rejectLead } from "@/modules/crm/leads/reject-lead.service";
import { rejectLeadSchema } from "@/lib/validations/crm";

type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const LEAD_STATUSES = ["new", "pending", "in_review", "approved", "rejected"] as const;
const REJECT_REASONS = [
  "spot_service",
  "out_of_scope",
  "no_budget",
  "duplicate",
  "no_response",
  "other",
] as const;

async function logAiAction(opts: {
  tenantId: string;
  userId: string;
  toolName: string;
  args: unknown;
  status: "success" | "denied" | "validation_error" | "internal_error";
  resultEntityId?: string;
  resultEntityType?: string;
  errorMessage?: string;
  startedAt: number;
}) {
  try {
    await prisma.aiActionLog.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        toolName: opts.toolName,
        args: opts.args as Prisma.InputJsonValue,
        status: opts.status,
        resultEntityId: opts.resultEntityId ?? null,
        resultEntityType: opts.resultEntityType ?? null,
        errorMessage: opts.errorMessage ?? null,
        durationMs: Date.now() - opts.startedAt,
      },
    });
  } catch (e) {
    console.error("[help-chat-crm-comercial] logAiAction falló", e);
  }
}

function denied(msg: string) {
  return { ok: false as const, error: msg };
}

function canDeleteQuote(perms: RolePermissions) {
  return canDelete(perms, "cpq") || canDelete(perms, "crm", "quotes");
}

function missingConfirmMessage(previewTool: string): string {
  return (
    `Esta acción requiere confirmación. Llama primero ${previewTool}, ` +
    "muestra el resumen al usuario y, solo si confirma, vuelve a llamar esta tool " +
    "con confirm=true y el previewToken."
  );
}

function requireConfirmAndToken(
  args: Record<string, unknown>,
  previewTool: string,
): { ok: true; token: string } | { ok: false; error: string } {
  if (args.confirm !== true) {
    return { ok: false, error: missingConfirmMessage(previewTool) };
  }
  const token = typeof args.previewToken === "string" ? args.previewToken.trim() : "";
  if (!token) {
    return {
      ok: false,
      error: `Falta previewToken. Llama primero ${previewTool}.`,
    };
  }
  return { ok: true, token };
}

async function consumeOrRefuse(
  token: string,
  tenantId: string,
  userId: string,
  persistTool: CrmComercialPersistToolName,
  previewTool: string,
) {
  const cached = consumePreview(token, tenantId, userId, persistTool);
  if (!cached) {
    return {
      ok: false as const,
      error: `El previewToken no existe o expiró. Vuelve a llamar ${previewTool}.`,
    };
  }
  return { ok: true as const, cached };
}

async function jsonFromResponse(res: NextResponse): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

export type LeadSearchHit = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  commune: string | null;
  city: string | null;
  createdAt: string;
  url: string;
};

export async function searchLeadsForQuery(
  tenantId: string,
  query: string,
  limit: number,
  status?: string,
): Promise<LeadSearchHit[]> {
  const q = query.trim();
  const take = Math.max(1, Math.min(limit || 10, 25));
  const where: Prisma.CrmLeadWhereInput = { tenantId };
  if (status && status !== "all") where.status = status;
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { industry: { contains: q, mode: "insensitive" } },
      { commune: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.crmLead.findMany({
    where,
    take,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      companyName: true,
      email: true,
      phone: true,
      status: true,
      source: true,
      commune: true,
      city: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: leadDisplayName(r),
    companyName: r.companyName,
    email: r.email,
    phone: r.phone,
    status: r.status,
    source: r.source,
    commune: r.commune,
    city: r.city,
    createdAt: r.createdAt.toISOString(),
    url: `/crm/leads/${r.id}`,
  }));
}

export function crmComercialReadToolDefinitions(): ToolDef[] {
  return [
    {
      type: "function",
      function: {
        name: "search_leads",
        description:
          "Busca leads/prospectos CRM por empresa, nombre, email, teléfono, comuna o industria. " +
          "Los correos «nuevo lead» de OPAI caen aquí (no en deals ni CPQ). " +
          "Usa get_lead con el id para el detalle. Filtro opcional de status.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto (empresa, persona, email, teléfono)." },
            status: {
              type: "string",
              enum: ["all", ...LEAD_STATUSES],
              description: "Default all.",
            },
            limit: { type: "number", description: "Máximo 25, default 10." },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_lead",
        description:
          "Detalle de un lead CRM por UUID. Incluye estado, contacto, empresa, notas y entidades convertidas si ya fue aprobado. " +
          "No marca el lead como visto (eso lo hace la ficha UI). No usar para aprobar/rechazar/eliminar.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "UUID del lead." },
          },
          required: ["id"],
          additionalProperties: false,
        },
      },
    },
  ];
}

export function crmComercialWriteToolDefinitions(): ToolDef[] {
  return [
    {
      type: "function",
      function: {
        name: "preview_delete_deal",
        description:
          "PASO 1 (obligatorio). Previsualiza eliminar un negocio CRM: cotizaciones a papelera, propuestas, agenda e instalación opcional. " +
          "NO borra nada. Devuelve impacto, bloqueos y previewToken. Si hay blockers, no se puede confirmar sin force=true en un preview nuevo.",
        parameters: {
          type: "object",
          properties: {
            dealId: { type: "string", description: "UUID del negocio." },
            force: { type: "boolean", description: "Incluir para forzar pese a blockers (igual que la UI)." },
            reason: { type: "string", description: "Motivo opcional (queda en historial/papelera)." },
            deleteInstallation: {
              type: "boolean",
              description: "Si true y la instalación se puede borrar, se elimina con el negocio.",
            },
          },
          required: ["dealId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delete_deal",
        description:
          "PASO 2. Elimina el negocio (mismo DELETE /api/crm/deals/[id]: cotizaciones a papelera, no wipe SQL). " +
          "Requiere confirm=true y previewToken de preview_delete_deal. Scope READ_WRITE. Permiso canDelete(crm, deals).",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            confirm: { type: "boolean", description: "Debe ser true. Sin confirmación se rechaza." },
            dealId: { type: "string" },
            force: { type: "boolean" },
            reason: { type: "string" },
            deleteInstallation: { type: "boolean" },
          },
          required: ["confirm", "previewToken"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "preview_delete_quote",
        description:
          "PASO 1 (obligatorio). Previsualiza enviar una cotización CPQ a la papelera (mismo camino que la UI: impacto + blockers). " +
          "NO borra. Si hay blockers (contrato, flujo de caja, aceptada en portal) no se confirma sin force=true.",
        parameters: {
          type: "object",
          properties: {
            quoteIdOrCode: { type: "string", description: "UUID o código CPQ-YYYY-NNN." },
            force: { type: "boolean" },
            reason: { type: "string" },
          },
          required: ["quoteIdOrCode"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delete_quote",
        description:
          "PASO 2. Envía la cotización a papelera restaurable (deleteQuoteToTrash), no un wipe. " +
          "Requiere confirm=true y previewToken. Permiso igual UI: canDelete(cpq) o canDelete(crm, quotes).",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            confirm: { type: "boolean" },
            quoteIdOrCode: { type: "string" },
            force: { type: "boolean" },
            reason: { type: "string" },
          },
          required: ["confirm", "previewToken"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "preview_delete_lead",
        description:
          "PASO 1. Previsualiza eliminar un lead no aprobado (status new/pending/in_review/rejected). NO borra. Un lead aprobado no se puede eliminar.",
        parameters: {
          type: "object",
          properties: {
            leadId: { type: "string", description: "UUID del lead." },
          },
          required: ["leadId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delete_lead",
        description:
          "PASO 2. Elimina el lead (mismo DELETE /api/crm/leads/[id]). Requiere confirm=true y previewToken. No elimina leads aprobados. Permiso canDelete(crm, leads).",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            confirm: { type: "boolean" },
            leadId: { type: "string" },
          },
          required: ["confirm", "previewToken"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "preview_approve_lead",
        description:
          "PASO 1. Previsualiza aprobar/convertir un lead (POST /api/crm/leads/[id]/approve): crea cuenta, contacto, negocio, instalaciones y cotización. " +
          "Corre checkDuplicates igual que la UI. NO persiste. Tras OK usa approve_lead o convert_lead con el previewToken.",
        parameters: {
          type: "object",
          properties: {
            leadId: { type: "string" },
            accountName: { type: "string" },
            contactFirstName: { type: "string" },
            contactLastName: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            dealTitle: { type: "string" },
            useExistingAccountId: { type: "string" },
          },
          required: ["leadId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "approve_lead",
        description:
          "PASO 2. Aprueba y convierte el lead (cuenta + contacto + deal + CPQ + instalaciones), misma semántica que la UI. " +
          "Requiere confirm=true y previewToken de preview_approve_lead. Permiso canEdit(crm, leads).",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            confirm: { type: "boolean" },
            leadId: { type: "string" },
          },
          required: ["confirm", "previewToken"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "convert_lead",
        description:
          "Alias de approve_lead: convierte el lead en cuenta/contacto/negocio/cotización/instalaciones. " +
          "PASO 2 tras preview_approve_lead. Requiere confirm=true y el mismo previewToken.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            confirm: { type: "boolean" },
            leadId: { type: "string" },
          },
          required: ["confirm", "previewToken"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "preview_reject_lead",
        description:
          "PASO 1. Previsualiza rechazar un lead (queda en CRM con status rejected). Motivos iguales a la UI. " +
          "sendEmail=true exige asunto y cuerpo y Gmail conectado. NO persiste.",
        parameters: {
          type: "object",
          properties: {
            leadId: { type: "string" },
            reason: {
              type: "string",
              enum: [...REJECT_REASONS],
              description: "Default other.",
            },
            note: { type: "string" },
            sendEmail: { type: "boolean", description: "Default false." },
            emailSubject: { type: "string" },
            emailBody: { type: "string" },
          },
          required: ["leadId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "reject_lead",
        description:
          "PASO 2. Rechaza el lead (POST /api/crm/leads/[id]/reject). Requiere confirm=true y previewToken. No se puede rechazar un lead ya aprobado.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            confirm: { type: "boolean" },
            leadId: { type: "string" },
          },
          required: ["confirm", "previewToken"],
          additionalProperties: false,
        },
      },
    },
  ];
}

export const CRM_COMERCIAL_PREVIEW_TO_CONFIRM: Record<
  string,
  { confirmToolName: string; label: string }
> = {
  preview_delete_deal: { confirmToolName: "delete_deal", label: "Eliminar negocio" },
  preview_delete_quote: { confirmToolName: "delete_quote", label: "Eliminar cotización (papelera)" },
  preview_delete_lead: { confirmToolName: "delete_lead", label: "Eliminar lead" },
  preview_approve_lead: { confirmToolName: "approve_lead", label: "Aprobar y convertir lead" },
  preview_reject_lead: { confirmToolName: "reject_lead", label: "Rechazar lead" },
};

export const CRM_COMERCIAL_WRITE_TOOL_LABELS: Record<string, string> = {
  delete_deal: "Eliminar negocio",
  delete_quote: "Eliminar cotización",
  delete_lead: "Eliminar lead",
  approve_lead: "Aprobar y convertir lead",
  convert_lead: "Convertir lead",
  reject_lead: "Rechazar lead",
};

export async function toolSearchLeads(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canView(perms, "crm", "leads")) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "search_leads",
      args,
      status: "denied",
      errorMessage: "Sin permiso crm.leads.view",
      startedAt: t0,
    });
    return denied("No tienes permiso para ver leads.");
  }
  const query = typeof args.query === "string" ? args.query : "";
  const status = typeof args.status === "string" ? args.status : undefined;
  const limit = typeof args.limit === "number" ? args.limit : 10;
  const data = await searchLeadsForQuery(tenantId, query, limit, status);
  return { ok: true, data };
}

export async function toolGetLead(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canView(perms, "crm", "leads")) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "get_lead",
      args,
      status: "denied",
      errorMessage: "Sin permiso crm.leads.view",
      startedAt: t0,
    });
    return denied("No tienes permiso para ver leads.");
  }
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!isUuid(id)) {
    return denied("Falta un UUID válido del lead. Usa search_leads.");
  }
  const lead = await prisma.crmLead.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      status: true,
      source: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      companyName: true,
      notes: true,
      industry: true,
      address: true,
      commune: true,
      city: true,
      website: true,
      serviceType: true,
      approvedAt: true,
      convertedAccountId: true,
      convertedContactId: true,
      convertedDealId: true,
      firstContactAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!lead) {
    return denied("Lead no encontrado o no pertenece a tu organización.");
  }
  return {
    ok: true,
    data: {
      ...lead,
      name: leadDisplayName(lead),
      url: `/crm/leads/${lead.id}`,
      approvedAt: lead.approvedAt?.toISOString() ?? null,
      firstContactAt: lead.firstContactAt?.toISOString() ?? null,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
    },
  };
}

export async function toolPreviewDeleteDeal(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canDelete(perms, "crm", "deals")) {
    await logAiAction({
      tenantId, userId, toolName: "preview_delete_deal", args,
      status: "denied", errorMessage: "Sin permiso crm.deals.delete", startedAt: t0,
    });
    return denied("No tienes permiso para eliminar negocios.");
  }
  const dealId = typeof args.dealId === "string" ? args.dealId.trim() : "";
  if (!isUuid(dealId)) return denied("dealId debe ser un UUID. Usa search_deals.");
  const force = args.force === true;
  const reason = typeof args.reason === "string" ? args.reason : null;
  const deleteInstallation = args.deleteInstallation === true;

  const impact = await buildDealDeleteImpact(tenantId, dealId);
  if (!impact) return denied("Negocio no encontrado o no pertenece a tu organización.");

  const canProceed = impact.blockers.length === 0 || force;
  const previewToken = storePreview({
    tenantId,
    userId,
    toolName: "delete_deal",
    args: { dealId, force, reason, deleteInstallation },
    computed: { dealId, title: impact.deal.title, canProceed },
  });

  await logAiAction({
    tenantId, userId, toolName: "preview_delete_deal", args,
    status: "success", resultEntityId: dealId, resultEntityType: "crm_deal", startedAt: t0,
  });

  return {
    ok: true,
    data: {
      previewToken,
      expiresInSeconds: 300,
      canProceed,
      summary: {
        dealId: impact.deal.id,
        title: impact.deal.title,
        quotes: impact.quotes.map((q) => ({
          id: q.quote.id,
          code: q.quote.code,
          name: q.quote.name,
          status: q.quote.status,
          blockers: q.blockers,
        })),
        counts: impact.counts,
        blockers: impact.blockers,
        warnings: impact.warnings,
        installation: impact.installation,
        force,
        deleteInstallation,
      },
      nextStep: canProceed
        ? "Si el usuario confirma, llama delete_deal con confirm=true y el previewToken."
        : "Hay bloqueos. Para forzar (igual que la UI) llama preview_delete_deal de nuevo con force=true, muestra el riesgo, y recién entonces confirma.",
    },
  };
}

export async function toolDeleteDeal(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canDelete(perms, "crm", "deals")) {
    await logAiAction({
      tenantId, userId, toolName: "delete_deal", args,
      status: "denied", errorMessage: "Sin permiso crm.deals.delete", startedAt: t0,
    });
    return denied("No tienes permiso para eliminar negocios.");
  }
  const gate = requireConfirmAndToken(args, "preview_delete_deal");
  if (!gate.ok) {
    await logAiAction({
      tenantId, userId, toolName: "delete_deal", args,
      status: "validation_error", errorMessage: gate.error, startedAt: t0,
    });
    return denied(gate.error);
  }
  const consumed = await consumeOrRefuse(gate.token, tenantId, userId, "delete_deal", "preview_delete_deal");
  if (!consumed.ok) return denied(consumed.error);
  const a = consumed.cached.args;
  const result = await executeDealDelete({
    tenantId,
    userId,
    dealId: String(a.dealId),
    force: a.force === true,
    reason: typeof a.reason === "string" ? a.reason : null,
    deleteInstallation: a.deleteInstallation === true,
  });
  if (!result.ok) {
    await logAiAction({
      tenantId, userId, toolName: "delete_deal", args,
      status: "validation_error", errorMessage: result.error, startedAt: t0,
    });
    return { ok: false, error: result.error, blockers: result.blockers };
  }
  await logAiAction({
    tenantId, userId, toolName: "delete_deal", args,
    status: "success", resultEntityId: String(a.dealId), resultEntityType: "crm_deal", startedAt: t0,
  });
  return {
    ok: true,
    data: {
      title: result.title,
      cascaded: result.cascaded,
      message: "Negocio eliminado. Las cotizaciones fueron a la papelera CPQ (restaurables).",
    },
  };
}

export async function toolPreviewDeleteQuote(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canDeleteQuote(perms)) {
    await logAiAction({
      tenantId, userId, toolName: "preview_delete_quote", args,
      status: "denied", errorMessage: "Sin permiso eliminar cotizaciones", startedAt: t0,
    });
    return denied("No tienes permiso para eliminar cotizaciones.");
  }
  const raw = typeof args.quoteIdOrCode === "string" ? args.quoteIdOrCode.trim() : "";
  if (!raw) return denied("Falta quoteIdOrCode. Usa search_quotes.");
  let quote: { id: string; code: string; name: string | null };
  try {
    const resolved = await resolveQuoteByCodeOrName(tenantId, raw);
    if (!resolved) return denied("Cotización no encontrada.");
    quote = resolved;
  } catch (e) {
    return denied(e instanceof Error ? e.message : "Cotización ambigua.");
  }
  const force = args.force === true;
  const reason = typeof args.reason === "string" ? args.reason : null;
  const impact = await buildQuoteDeleteImpact(tenantId, quote.id);
  if (!impact) return denied("Cotización no encontrada.");

  const canProceed = impact.blockers.length === 0 || force;
  const previewToken = storePreview({
    tenantId,
    userId,
    toolName: "delete_quote",
    args: { quoteId: quote.id, force, reason },
    computed: { code: impact.quote.code, canProceed },
  });

  await logAiAction({
    tenantId, userId, toolName: "preview_delete_quote", args,
    status: "success", resultEntityId: quote.id, resultEntityType: "cpq_quote", startedAt: t0,
  });

  return {
    ok: true,
    data: {
      previewToken,
      expiresInSeconds: 300,
      canProceed,
      summary: {
        quote: impact.quote,
        bundle: impact.bundle,
        counts: impact.counts,
        blockers: impact.blockers,
        warnings: impact.warnings,
        force,
        path: "papelera CPQ (restaurable), no wipe SQL",
      },
      nextStep: canProceed
        ? "Si el usuario confirma, llama delete_quote con confirm=true y el previewToken."
        : "Hay bloqueos (contrato, flujo de caja o aceptación de portal). Para forzar, preview_delete_quote con force=true y nueva confirmación.",
    },
  };
}

export async function toolDeleteQuote(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canDeleteQuote(perms)) {
    await logAiAction({
      tenantId, userId, toolName: "delete_quote", args,
      status: "denied", errorMessage: "Sin permiso eliminar cotizaciones", startedAt: t0,
    });
    return denied("No tienes permiso para eliminar cotizaciones.");
  }
  const gate = requireConfirmAndToken(args, "preview_delete_quote");
  if (!gate.ok) {
    await logAiAction({
      tenantId, userId, toolName: "delete_quote", args,
      status: "validation_error", errorMessage: gate.error, startedAt: t0,
    });
    return denied(gate.error);
  }
  const consumed = await consumeOrRefuse(gate.token, tenantId, userId, "delete_quote", "preview_delete_quote");
  if (!consumed.ok) return denied(consumed.error);
  const a = consumed.cached.args;
  const result = await executeQuoteDelete({
    tenantId,
    userId,
    quoteId: String(a.quoteId),
    force: a.force === true,
    reason: typeof a.reason === "string" ? a.reason : null,
  });
  if (!result.ok) {
    await logAiAction({
      tenantId, userId, toolName: "delete_quote", args,
      status: "validation_error", errorMessage: result.error, startedAt: t0,
    });
    return { ok: false, error: result.error, blockers: result.blockers };
  }
  await logAiAction({
    tenantId, userId, toolName: "delete_quote", args,
    status: "success", resultEntityId: String(a.quoteId), resultEntityType: "cpq_quote", startedAt: t0,
  });
  return {
    ok: true,
    data: {
      trashId: result.trashId,
      code: result.code,
      name: result.name,
      bundleDeleted: result.bundleDeleted,
      message: "Cotización enviada a la papelera CPQ (restaurable).",
    },
  };
}

export async function toolPreviewDeleteLead(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canDelete(perms, "crm", "leads")) {
    await logAiAction({
      tenantId, userId, toolName: "preview_delete_lead", args,
      status: "denied", errorMessage: "Sin permiso crm.leads.delete", startedAt: t0,
    });
    return denied("No tienes permiso para eliminar leads.");
  }
  const leadId = typeof args.leadId === "string" ? args.leadId.trim() : "";
  if (!isUuid(leadId)) return denied("leadId debe ser un UUID. Usa search_leads.");
  const lead = await prisma.crmLead.findFirst({
    where: { id: leadId, tenantId },
    select: { id: true, status: true, firstName: true, lastName: true, companyName: true, email: true },
  });
  if (!lead) return denied("Lead no encontrado o no pertenece a tu organización.");
  const deletable = (DELETABLE_LEAD_STATUSES as readonly string[]).includes(lead.status);
  if (!deletable) {
    return {
      ok: true,
      data: {
        previewToken: null,
        expiresInSeconds: 300,
        canProceed: false,
        summary: {
          leadId: lead.id,
          name: leadDisplayName(lead),
          status: lead.status,
          url: `/crm/leads/${lead.id}`,
        },
        nextStep: "No se puede eliminar un lead aprobado.",
      },
    };
  }
  const previewToken = storePreview({
    tenantId,
    userId,
    toolName: "delete_lead",
    args: { leadId },
    computed: { status: lead.status, deletable: true },
  });
  await logAiAction({
    tenantId, userId, toolName: "preview_delete_lead", args,
    status: "success", resultEntityId: leadId, resultEntityType: "crm_lead", startedAt: t0,
  });
  return {
    ok: true,
    data: {
      previewToken,
      expiresInSeconds: 300,
      canProceed: true,
      summary: {
        leadId: lead.id,
        name: leadDisplayName(lead),
        status: lead.status,
        url: `/crm/leads/${lead.id}`,
      },
      nextStep: "Si el usuario confirma, llama delete_lead con confirm=true y el previewToken.",
    },
  };
}

export async function toolDeleteLead(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canDelete(perms, "crm", "leads")) {
    await logAiAction({
      tenantId, userId, toolName: "delete_lead", args,
      status: "denied", errorMessage: "Sin permiso crm.leads.delete", startedAt: t0,
    });
    return denied("No tienes permiso para eliminar leads.");
  }
  const gate = requireConfirmAndToken(args, "preview_delete_lead");
  if (!gate.ok) {
    await logAiAction({
      tenantId, userId, toolName: "delete_lead", args,
      status: "validation_error", errorMessage: gate.error, startedAt: t0,
    });
    return denied(gate.error);
  }
  const consumed = await consumeOrRefuse(gate.token, tenantId, userId, "delete_lead", "preview_delete_lead");
  if (!consumed.ok) return denied(consumed.error);
  const leadId = String(consumed.cached.args.leadId);
  const result = await executeLeadDelete({ tenantId, leadId });
  if (!result.ok) {
    await logAiAction({
      tenantId, userId, toolName: "delete_lead", args,
      status: "validation_error", errorMessage: result.error, startedAt: t0,
    });
    return { ok: false, error: result.error };
  }
  await logAiAction({
    tenantId, userId, toolName: "delete_lead", args,
    status: "success", resultEntityId: leadId, resultEntityType: "crm_lead", startedAt: t0,
  });
  return { ok: true, data: { id: result.id, name: result.displayName, status: result.status } };
}

function approveBodyFromArgs(args: Record<string, unknown>) {
  return {
    accountName: typeof args.accountName === "string" ? args.accountName : undefined,
    contactFirstName: typeof args.contactFirstName === "string" ? args.contactFirstName : undefined,
    contactLastName: typeof args.contactLastName === "string" ? args.contactLastName : undefined,
    email: typeof args.email === "string" ? args.email : undefined,
    phone: typeof args.phone === "string" ? args.phone : undefined,
    dealTitle: typeof args.dealTitle === "string" ? args.dealTitle : undefined,
    useExistingAccountId: typeof args.useExistingAccountId === "string" ? args.useExistingAccountId : undefined,
  };
}

export async function toolPreviewApproveLead(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "leads")) {
    await logAiAction({
      tenantId, userId, toolName: "preview_approve_lead", args,
      status: "denied", errorMessage: "Sin permiso crm.leads.edit", startedAt: t0,
    });
    return denied("No tienes permiso para aprobar leads.");
  }
  const leadId = typeof args.leadId === "string" ? args.leadId.trim() : "";
  if (!isUuid(leadId)) return denied("leadId debe ser un UUID. Usa search_leads.");
  const lead = await prisma.crmLead.findFirst({
    where: { id: leadId, tenantId },
    select: {
      id: true, status: true, firstName: true, lastName: true, companyName: true,
      email: true, phone: true,
    },
  });
  if (!lead) return denied("Lead no encontrado o no pertenece a tu organización.");
  if (lead.status === "approved") return denied("El lead ya fue aprobado y convertido.");

  const body = approveBodyFromArgs(args);
  const dupRes = await approveLead({
    tenantId,
    userId,
    leadId,
    body: { ...body, checkDuplicates: true },
  });
  const dupJson = await jsonFromResponse(dupRes);

  const previewToken = storePreview({
    tenantId,
    userId,
    toolName: "approve_lead",
    args: { leadId, ...body },
    computed: { name: leadDisplayName(lead) },
  });

  await logAiAction({
    tenantId, userId, toolName: "preview_approve_lead", args,
    status: "success", resultEntityId: leadId, resultEntityType: "crm_lead", startedAt: t0,
  });

  return {
    ok: true,
    data: {
      previewToken,
      expiresInSeconds: 300,
      summary: {
        leadId: lead.id,
        name: leadDisplayName(lead),
        status: lead.status,
        willCreate: "cuenta + contacto + negocio + cotización CPQ + instalaciones (mismo POST /approve)",
        accountName: body.accountName ?? lead.companyName,
        dealTitle: body.dealTitle ?? null,
        duplicates: dupJson.duplicates ?? [],
        existingContact: dupJson.existingContact ?? null,
        installationConflicts: dupJson.installationConflicts ?? null,
        duplicateMessage: dupJson.message ?? null,
      },
      nextStep:
        "Muestra el resumen y conflictos. Si el usuario confirma, llama approve_lead o convert_lead con confirm=true y el previewToken.",
    },
  };
}

export async function toolApproveLead(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  toolName: "approve_lead" | "convert_lead" = "approve_lead",
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "leads")) {
    await logAiAction({
      tenantId, userId, toolName, args,
      status: "denied", errorMessage: "Sin permiso crm.leads.edit", startedAt: t0,
    });
    return denied("No tienes permiso para aprobar leads.");
  }
  const gate = requireConfirmAndToken(args, "preview_approve_lead");
  if (!gate.ok) {
    await logAiAction({
      tenantId, userId, toolName, args,
      status: "validation_error", errorMessage: gate.error, startedAt: t0,
    });
    return denied(gate.error);
  }
  const consumed = await consumeOrRefuse(gate.token, tenantId, userId, "approve_lead", "preview_approve_lead");
  if (!consumed.ok) return denied(consumed.error);
  const a = consumed.cached.args;
  const res = await approveLead({
    tenantId,
    userId,
    leadId: String(a.leadId),
    body: approveBodyFromArgs(a),
  });
  const json = await jsonFromResponse(res);
  if (json.success !== true) {
    await logAiAction({
      tenantId, userId, toolName, args,
      status: "validation_error",
      errorMessage: typeof json.error === "string" ? json.error : "Error al aprobar",
      startedAt: t0,
    });
    return { ok: false, error: json.error ?? "No se pudo aprobar el lead", details: json };
  }
  const data = json.data as { deal?: { id?: string }; account?: { id?: string } } | undefined;
  await logAiAction({
    tenantId, userId, toolName, args,
    status: "success",
    resultEntityId: data?.deal?.id ?? String(a.leadId),
    resultEntityType: "crm_deal",
    startedAt: t0,
  });
  return { ok: true, data: json.data };
}

export async function toolPreviewRejectLead(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "leads")) {
    await logAiAction({
      tenantId, userId, toolName: "preview_reject_lead", args,
      status: "denied", errorMessage: "Sin permiso crm.leads.edit", startedAt: t0,
    });
    return denied("No tienes permiso para rechazar leads.");
  }
  const leadId = typeof args.leadId === "string" ? args.leadId.trim() : "";
  if (!isUuid(leadId)) return denied("leadId debe ser un UUID. Usa search_leads.");
  const parsed = rejectLeadSchema.safeParse({
    reason: typeof args.reason === "string" ? args.reason : "other",
    note: typeof args.note === "string" ? args.note : undefined,
    sendEmail: args.sendEmail === true,
    emailSubject: typeof args.emailSubject === "string" ? args.emailSubject : undefined,
    emailBody: typeof args.emailBody === "string" ? args.emailBody : undefined,
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return denied(`Datos inválidos: ${msg}`);
  }
  const lead = await prisma.crmLead.findFirst({
    where: { id: leadId, tenantId },
    select: { id: true, status: true, firstName: true, lastName: true, companyName: true, email: true },
  });
  if (!lead) return denied("Lead no encontrado o no pertenece a tu organización.");
  if (lead.status === "approved") {
    return denied("El lead ya fue aprobado y convertido. No se puede rechazar en este estado.");
  }

  const previewToken = storePreview({
    tenantId,
    userId,
    toolName: "reject_lead",
    args: { leadId, ...parsed.data },
    computed: { name: leadDisplayName(lead) },
  });
  await logAiAction({
    tenantId, userId, toolName: "preview_reject_lead", args,
    status: "success", resultEntityId: leadId, resultEntityType: "crm_lead", startedAt: t0,
  });
  return {
    ok: true,
    data: {
      previewToken,
      expiresInSeconds: 300,
      summary: {
        leadId: lead.id,
        name: leadDisplayName(lead),
        status: lead.status,
        reason: parsed.data.reason,
        note: parsed.data.note ?? null,
        sendEmail: parsed.data.sendEmail,
        hasEmail: Boolean(lead.email),
      },
      nextStep: "Si el usuario confirma, llama reject_lead con confirm=true y el previewToken.",
    },
  };
}

export async function toolRejectLead(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "leads")) {
    await logAiAction({
      tenantId, userId, toolName: "reject_lead", args,
      status: "denied", errorMessage: "Sin permiso crm.leads.edit", startedAt: t0,
    });
    return denied("No tienes permiso para rechazar leads.");
  }
  const gate = requireConfirmAndToken(args, "preview_reject_lead");
  if (!gate.ok) {
    await logAiAction({
      tenantId, userId, toolName: "reject_lead", args,
      status: "validation_error", errorMessage: gate.error, startedAt: t0,
    });
    return denied(gate.error);
  }
  const consumed = await consumeOrRefuse(gate.token, tenantId, userId, "reject_lead", "preview_reject_lead");
  if (!consumed.ok) return denied(consumed.error);
  const a = consumed.cached.args;
  const parsed = rejectLeadSchema.safeParse(a);
  if (!parsed.success) return denied("El preview expiró con datos inválidos. Vuelve a preview_reject_lead.");
  const res = await rejectLead({
    tenantId,
    userId,
    leadId: String(a.leadId),
    body: parsed.data,
  });
  const json = await jsonFromResponse(res);
  if (json.success !== true) {
    await logAiAction({
      tenantId, userId, toolName: "reject_lead", args,
      status: "validation_error",
      errorMessage: typeof json.error === "string" ? json.error : "Error al rechazar",
      startedAt: t0,
    });
    return { ok: false, error: json.error ?? "No se pudo rechazar el lead", details: json };
  }
  await logAiAction({
    tenantId, userId, toolName: "reject_lead", args,
    status: "success", resultEntityId: String(a.leadId), resultEntityType: "crm_lead", startedAt: t0,
  });
  return { ok: true, data: { id: a.leadId, email: json.email } };
}
