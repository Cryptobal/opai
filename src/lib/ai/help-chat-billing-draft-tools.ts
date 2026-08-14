/**
 * Tools del help-chat para borradores de facturación en Programación
 * (FinanceDte DRAFT) y plantillas recurrentes: buscar y actualizar
 * referencias adicionales (HES / OC / etc.).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storePreview, consumePreview } from "@/lib/ai/dte-preview-cache";
import {
  hasFacturacionCapability,
  type RolePermissions,
} from "@/lib/permissions";
import type { DraftAdditionalReference } from "@/modules/finance/billing/dte-draft.service";

export type BillingRefInput = {
  tipoDocRef: string;
  folioRef: string;
  fchRef: string;
  razonRef: string;
};

function todayYmd(): string {
  return new Date().toISOString().split("T")[0]!;
}

/** Normaliza aliases comunes del LLM/usuario a códigos que usa la UI. */
export function normalizeTipoDocRef(raw: string): string {
  const t = raw.trim();
  const u = t.toUpperCase();
  if (
    u === "OC" ||
    u === "801" ||
    u === "ORDEN DE COMPRA" ||
    u === "ORDEN_DE_COMPRA" ||
    u === "PARA PEDIDO" ||
    u === "PEDIDO" ||
    u.includes("ORDEN DE COMPRA")
  ) {
    return "801";
  }
  if (
    u === "HES" ||
    u === "802" ||
    u.includes("HOJA DE ENTRADA") ||
    u.includes("HOJA ENTRADA")
  ) {
    return "HES";
  }
  if (u === "CONTRATO" || u === "803") return "803";
  return t;
}

export function sanitizeBillingRefs(raw: unknown): BillingRefInput[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const today = todayYmd();
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      tipoDocRef: normalizeTipoDocRef(
        typeof r.tipoDocRef === "string" ? r.tipoDocRef : "",
      ),
      folioRef: typeof r.folioRef === "string" ? r.folioRef.trim() : "",
      fchRef:
        typeof r.fchRef === "string" && r.fchRef.trim() ? r.fchRef.trim() : today,
      razonRef: typeof r.razonRef === "string" ? r.razonRef.trim() : "",
    }))
    .filter((r) => r.tipoDocRef && r.folioRef)
    .slice(0, 40);
}

/**
 * Fusiona refs nuevas sobre las existentes.
 * - merge: reemplaza folio/fecha si ya hay el mismo tipoDocRef; si no, agrega.
 * - replace: deja solo las nuevas.
 */
export function mergeBillingRefs(
  existing: DraftAdditionalReference[] | null | undefined,
  incoming: BillingRefInput[],
  mode: "merge" | "replace" = "merge",
): BillingRefInput[] {
  if (mode === "replace") return incoming;
  const base: BillingRefInput[] = (Array.isArray(existing) ? existing : [])
    .filter((r) => r?.tipoDocRef && r?.folioRef)
    .map((r) => ({
      tipoDocRef: normalizeTipoDocRef(String(r.tipoDocRef)),
      folioRef: String(r.folioRef).trim(),
      fchRef: (r.fchRef && String(r.fchRef).trim()) || todayYmd(),
      razonRef: r.razonRef ? String(r.razonRef).trim() : "",
    }));
  const byType = new Map<string, BillingRefInput>();
  for (const r of base) byType.set(r.tipoDocRef, r);
  for (const r of incoming) byType.set(r.tipoDocRef, r);
  return Array.from(byType.values()).slice(0, 40);
}

function formatRefsLabel(refs: BillingRefInput[]): string {
  if (refs.length === 0) return "sin referencias";
  return refs
    .map((r) => {
      const label =
        r.tipoDocRef === "801"
          ? "OC"
          : r.tipoDocRef === "HES" || r.tipoDocRef === "802"
            ? "HES"
            : r.tipoDocRef;
      return `${label} ${r.folioRef}`;
    })
    .join(", ");
}

function dteTypeLabel(dteType: number): string {
  switch (dteType) {
    case 33:
      return "Factura afecta";
    case 34:
      return "Factura exenta";
    case 39:
      return "Boleta";
    case 56:
      return "Nota de débito";
    case 61:
      return "Nota de crédito";
    default:
      return `DTE ${dteType}`;
  }
}

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
    console.error("[help-chat-billing] logAiAction falló", e);
  }
}

// ── Tool definitions (lectura + escritura) ─────────────────────────────────

const REF_ITEM_SCHEMA = {
  type: "object",
  properties: {
    tipoDocRef: {
      type: "string",
      description:
        "Tipo: 'OC'/'801' (orden de compra / para pedido), 'HES'/'802' (hoja de entrada), 'Contrato'/'803', etc.",
    },
    folioRef: { type: "string", description: "Número/folio del documento." },
    fchRef: {
      type: "string",
      description: "Fecha YYYY-MM-DD. Si no aparece, usa hoy.",
    },
    razonRef: { type: "string", description: "Texto libre opcional." },
  },
  required: ["tipoDocRef", "folioRef", "fchRef"],
} as const;

export function billingDraftReadToolDefinitions() {
  return [
    {
      type: "function" as const,
      function: {
        name: "search_invoice_drafts",
        description:
          "Busca BORRADORES de factura pendientes en Finanzas → Facturación → Programación (siiStatus=DRAFT). Úsala cuando el usuario diga 'borrador programado', 'borrador pendiente', 'programación', 'Polpaico del bosque', etc. NO confundir con cotizaciones CPQ (search_quotes). Busca por cliente, instalación, nombre de plantilla recurrente, RUT o monto. Devuelve id, cliente, instalación, plantilla, montos y referencias HES/OC actuales.",
        parameters: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description:
                "Texto: nombre cliente/instalación/plantilla, RUT o monto (ej: 'Polpaico bosque', '6380000').",
            },
            limit: { type: "number", description: "Máx 30, default 15." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_recurring_invoices",
        description:
          "Busca PLANTILLAS de facturación recurrente en Finanzas → Facturación → Programación. Úsala para 'plantilla recurrente', 'programación recurrente', o cuando el usuario quiera editar la plantilla (no el borrador del mes). Busca por nombre, cliente, RUT o instalación.",
        parameters: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Nombre plantilla, cliente, RUT o instalación.",
            },
            activeOnly: {
              type: "boolean",
              description: "Default true — solo plantillas activas.",
            },
            limit: { type: "number", description: "Máx 30, default 15." },
          },
          additionalProperties: false,
        },
      },
    },
  ];
}

export function billingDraftWriteToolDefinitions() {
  return [
    {
      type: "function" as const,
      function: {
        name: "preview_update_invoice_draft_refs",
        description:
          "PASO 1. Previsualiza la actualización de referencias adicionales (HES, OC, etc.) de un BORRADOR de factura YA existente en Programación. No persiste. Devuelve previewToken + refs antes/después. Flujo típico: correo con captura SAP → read_email_attachments (visión) → search_invoice_drafts → esta tool → confirmación → update_invoice_draft_refs.",
        parameters: {
          type: "object",
          properties: {
            draftId: { type: "string", description: "UUID del borrador (de search_invoice_drafts)." },
            additionalReferences: {
              type: "array",
              description: "Referencias a aplicar (HES, OC/801, etc.).",
              items: REF_ITEM_SCHEMA,
              minItems: 1,
              maxItems: 40,
            },
            mode: {
              type: "string",
              enum: ["merge", "replace"],
              description:
                "merge (default): actualiza/agrega por tipo. replace: deja solo las nuevas.",
            },
          },
          required: ["draftId", "additionalReferences"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_invoice_draft_refs",
        description:
          "PASO 2 (tras preview_update_invoice_draft_refs Y confirmación). Persiste las referencias HES/OC en el borrador. Pasa previewToken y/o los mismos args del preview.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            draftId: { type: "string" },
            additionalReferences: {
              type: "array",
              items: REF_ITEM_SCHEMA,
              minItems: 1,
              maxItems: 40,
            },
            mode: { type: "string", enum: ["merge", "replace"] },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "preview_update_recurring_invoice_refs",
        description:
          "PASO 1. Previsualiza actualización de referencias (HES/OC) en una PLANTILLA recurrente existente. No persiste. Ojo: HES/OC suelen ser del período (cambian cada mes) — si el usuario habla del borrador del mes, preferí preview_update_invoice_draft_refs sobre el DRAFT.",
        parameters: {
          type: "object",
          properties: {
            templateId: {
              type: "string",
              description: "UUID de la plantilla (de search_recurring_invoices).",
            },
            additionalReferences: {
              type: "array",
              items: REF_ITEM_SCHEMA,
              minItems: 1,
              maxItems: 40,
            },
            mode: { type: "string", enum: ["merge", "replace"] },
          },
          required: ["templateId", "additionalReferences"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_recurring_invoice_refs",
        description:
          "PASO 2 (tras preview_update_recurring_invoice_refs Y confirmación). Persiste referencias en la plantilla recurrente.",
        parameters: {
          type: "object",
          properties: {
            previewToken: { type: "string" },
            templateId: { type: "string" },
            additionalReferences: {
              type: "array",
              items: REF_ITEM_SCHEMA,
              minItems: 1,
              maxItems: 40,
            },
            mode: { type: "string", enum: ["merge", "replace"] },
          },
          additionalProperties: false,
        },
      },
    },
  ];
}

// ── Executors ──────────────────────────────────────────────────────────────

export async function toolSearchInvoiceDrafts(
  tenantId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const search = typeof args.search === "string" ? args.search.trim() : "";
  const limitRaw = typeof args.limit === "number" ? args.limit : 15;
  const limit = Math.min(Math.max(1, limitRaw), 30);

  const matchingAccounts = search
    ? await prisma.crmAccount.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { legalName: { contains: search, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 50,
      })
    : [];
  const matchingInstallations = search
    ? await prisma.crmInstallation.findMany({
        where: {
          tenantId,
          name: { contains: search, mode: "insensitive" },
        },
        select: { id: true },
        take: 50,
      })
    : [];
  const matchingTemplates = search
    ? await prisma.financeDteRecurringTemplate.findMany({
        where: {
          tenantId,
          name: { contains: search, mode: "insensitive" },
        },
        select: { id: true },
        take: 50,
      })
    : [];

  const orClauses: Prisma.FinanceDteWhereInput[] = [];
  if (search) {
    const rutNeedle = search.replace(/[.\-\s]/g, "");
    orClauses.push(
      { receiverName: { contains: search, mode: "insensitive" } },
      { receiverRut: { contains: rutNeedle, mode: "insensitive" } },
    );
    if (matchingAccounts.length > 0) {
      orClauses.push({ crmAccountId: { in: matchingAccounts.map((a) => a.id) } });
    }
    if (matchingInstallations.length > 0) {
      orClauses.push({
        installationId: { in: matchingInstallations.map((i) => i.id) },
      });
    }
    if (matchingTemplates.length > 0) {
      orClauses.push({
        recurringTemplateId: { in: matchingTemplates.map((t) => t.id) },
      });
    }
    const amountStr = search.replace(/[.\s$]/g, "").replace(",", ".");
    if (/^\d+(\.\d+)?$/.test(amountStr)) {
      const amountNum = parseFloat(amountStr);
      if (amountNum > 0) {
        orClauses.push(
          { totalAmount: amountNum },
          { netAmount: amountNum },
        );
      }
    }
  }

  const drafts = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "ISSUED",
      siiStatus: "DRAFT",
      ...(orClauses.length > 0 ? { OR: orClauses } : {}),
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
      date: true,
      dteType: true,
      receiverName: true,
      receiverRut: true,
      totalAmount: true,
      netAmount: true,
      taxAmount: true,
      currency: true,
      additionalReferences: true,
      crmAccountId: true,
      installationId: true,
      recurringTemplateId: true,
      billingPeriod: true,
    },
  });

  const accountIds = [
    ...new Set(drafts.map((d) => d.crmAccountId).filter(Boolean)),
  ] as string[];
  const installationIds = [
    ...new Set(drafts.map((d) => d.installationId).filter(Boolean)),
  ] as string[];
  const templateIds = [
    ...new Set(drafts.map((d) => d.recurringTemplateId).filter(Boolean)),
  ] as string[];

  const [accounts, installations, templates] = await Promise.all([
    accountIds.length
      ? prisma.crmAccount.findMany({
          where: { tenantId, id: { in: accountIds } },
          select: { id: true, name: true },
        })
      : [],
    installationIds.length
      ? prisma.crmInstallation.findMany({
          where: { tenantId, id: { in: installationIds } },
          select: { id: true, name: true },
        })
      : [],
    templateIds.length
      ? prisma.financeDteRecurringTemplate.findMany({
          where: { tenantId, id: { in: templateIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const installationName = new Map(installations.map((i) => [i.id, i.name]));
  const templateName = new Map(templates.map((t) => [t.id, t.name]));

  return {
    ok: true,
    data: {
      total: drafts.length,
      urlList: "/finanzas/facturacion/programacion",
      drafts: drafts.map((d) => {
        const refs = Array.isArray(d.additionalReferences)
          ? (d.additionalReferences as DraftAdditionalReference[])
          : [];
        const tplName = d.recurringTemplateId
          ? templateName.get(d.recurringTemplateId) ?? null
          : null;
        const instName = d.installationId
          ? installationName.get(d.installationId) ?? null
          : null;
        const accName = d.crmAccountId
          ? accountName.get(d.crmAccountId) ?? null
          : null;
        return {
          id: d.id,
          dteType: d.dteType,
          dteTypeLabel: dteTypeLabel(d.dteType),
          date: d.date.toISOString().slice(0, 10),
          billingPeriod: d.billingPeriod,
          receiverName: d.receiverName,
          receiverRut: d.receiverRut,
          accountName: accName,
          installationName: instName,
          templateName: tplName,
          displayName:
            tplName ||
            [accName, instName].filter(Boolean).join(" — ") ||
            d.receiverName,
          netAmount: Number(d.netAmount),
          taxAmount: Number(d.taxAmount),
          totalAmount: Number(d.totalAmount),
          currency: d.currency,
          additionalReferences: refs,
          refsLabel: formatRefsLabel(
            refs.map((r) => ({
              tipoDocRef: String(r.tipoDocRef),
              folioRef: String(r.folioRef ?? ""),
              fchRef: String(r.fchRef ?? ""),
              razonRef: String(r.razonRef ?? ""),
            })),
          ),
          url: `/finanzas/facturacion/emitir?draftId=${d.id}`,
          urlProgramacion: "/finanzas/facturacion/programacion",
        };
      }),
      instruction:
        "Estos son borradores pendientes de Programación (NO cotizaciones CPQ). " +
        "Para agregar/actualizar HES u OC usa preview_update_invoice_draft_refs con el draftId. " +
        "Mostrá :::cards con title=displayName, subtitle=cliente·instalación, meta=$neto, badge=refsLabel.",
    },
  };
}

export async function toolSearchRecurringInvoices(
  tenantId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const search = typeof args.search === "string" ? args.search.trim() : "";
  const activeOnly = args.activeOnly !== false;
  const limitRaw = typeof args.limit === "number" ? args.limit : 15;
  const limit = Math.min(Math.max(1, limitRaw), 30);

  const matchingAccounts = search
    ? await prisma.crmAccount.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { legalName: { contains: search, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 50,
      })
    : [];
  const matchingInstallations = search
    ? await prisma.crmInstallation.findMany({
        where: {
          tenantId,
          name: { contains: search, mode: "insensitive" },
        },
        select: { id: true },
        take: 50,
      })
    : [];

  const orClauses: Prisma.FinanceDteRecurringTemplateWhereInput[] = [];
  if (search) {
    const rutNeedle = search.replace(/[.\-\s]/g, "");
    orClauses.push(
      { name: { contains: search, mode: "insensitive" } },
      { receiverName: { contains: search, mode: "insensitive" } },
      { receiverRut: { contains: rutNeedle, mode: "insensitive" } },
    );
    if (matchingAccounts.length > 0) {
      orClauses.push({ crmAccountId: { in: matchingAccounts.map((a) => a.id) } });
    }
    if (matchingInstallations.length > 0) {
      orClauses.push({
        installationId: { in: matchingInstallations.map((i) => i.id) },
      });
    }
  }

  const templates = await prisma.financeDteRecurringTemplate.findMany({
    where: {
      tenantId,
      ...(activeOnly ? { isActive: true } : {}),
      ...(orClauses.length > 0 ? { OR: orClauses } : {}),
    },
    orderBy: [{ name: "asc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      isActive: true,
      dteType: true,
      frequency: true,
      dayOfMonth: true,
      nextRunAt: true,
      receiverName: true,
      receiverRut: true,
      currency: true,
      additionalReferences: true,
      crmAccountId: true,
      installationId: true,
      runCount: true,
    },
  });

  const accountIds = [
    ...new Set(templates.map((t) => t.crmAccountId).filter(Boolean)),
  ] as string[];
  const installationIds = [
    ...new Set(templates.map((t) => t.installationId).filter(Boolean)),
  ] as string[];
  const [accounts, installations] = await Promise.all([
    accountIds.length
      ? prisma.crmAccount.findMany({
          where: { tenantId, id: { in: accountIds } },
          select: { id: true, name: true },
        })
      : [],
    installationIds.length
      ? prisma.crmInstallation.findMany({
          where: { tenantId, id: { in: installationIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const installationName = new Map(installations.map((i) => [i.id, i.name]));

  return {
    ok: true,
    data: {
      total: templates.length,
      urlList: "/finanzas/facturacion/programacion",
      templates: templates.map((t) => {
        const refs = Array.isArray(t.additionalReferences)
          ? (t.additionalReferences as DraftAdditionalReference[])
          : [];
        return {
          id: t.id,
          name: t.name,
          isActive: t.isActive,
          dteType: t.dteType,
          dteTypeLabel: dteTypeLabel(t.dteType),
          frequency: t.frequency,
          dayOfMonth: t.dayOfMonth,
          nextRunAt: t.nextRunAt ? t.nextRunAt.toISOString() : null,
          runCount: t.runCount,
          receiverName: t.receiverName,
          receiverRut: t.receiverRut,
          accountName: t.crmAccountId
            ? accountName.get(t.crmAccountId) ?? null
            : null,
          installationName: t.installationId
            ? installationName.get(t.installationId) ?? null
            : null,
          currency: t.currency,
          additionalReferences: refs,
          refsLabel: formatRefsLabel(
            refs.map((r) => ({
              tipoDocRef: String(r.tipoDocRef),
              folioRef: String(r.folioRef ?? ""),
              fchRef: String(r.fchRef ?? ""),
              razonRef: String(r.razonRef ?? ""),
            })),
          ),
          url: "/finanzas/facturacion/programacion",
        };
      }),
      instruction:
        "Plantillas recurrentes (NO borradores del mes). HES/OC del período suelen ir en el borrador generado — usa search_invoice_drafts + preview_update_invoice_draft_refs. Solo actualizá la plantilla si el usuario pide explícitamente cambiar la plantilla.",
    },
  };
}

export async function toolPreviewUpdateInvoiceDraftRefs(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue")
  ) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "preview_update_invoice_draft_refs",
      args,
      status: "denied",
      errorMessage: "Sin permiso",
      startedAt: t0,
    });
    return { ok: false, error: "No tienes permiso para editar borradores de factura." };
  }

  const draftId = typeof args.draftId === "string" ? args.draftId.trim() : "";
  if (!draftId) return { ok: false, error: "Falta draftId." };
  const incoming = sanitizeBillingRefs(args.additionalReferences);
  if (incoming.length === 0) {
    return { ok: false, error: "Debes pasar al menos una referencia válida (tipoDocRef + folioRef)." };
  }
  const mode = args.mode === "replace" ? "replace" : "merge";

  const draft = await prisma.financeDte.findFirst({
    where: { id: draftId, tenantId, siiStatus: "DRAFT" },
    select: {
      id: true,
      dteType: true,
      receiverName: true,
      receiverRut: true,
      totalAmount: true,
      netAmount: true,
      currency: true,
      additionalReferences: true,
      recurringTemplateId: true,
      installationId: true,
      crmAccountId: true,
    },
  });
  if (!draft) {
    return {
      ok: false,
      error: "Borrador no encontrado o ya emitido. Usa search_invoice_drafts para obtener el id correcto.",
    };
  }

  const before = Array.isArray(draft.additionalReferences)
    ? (draft.additionalReferences as DraftAdditionalReference[])
    : [];
  const after = mergeBillingRefs(before, incoming, mode);

  const [tpl, inst, acc] = await Promise.all([
    draft.recurringTemplateId
      ? prisma.financeDteRecurringTemplate.findFirst({
          where: { id: draft.recurringTemplateId, tenantId },
          select: { name: true },
        })
      : null,
    draft.installationId
      ? prisma.crmInstallation.findFirst({
          where: { id: draft.installationId, tenantId },
          select: { name: true },
        })
      : null,
    draft.crmAccountId
      ? prisma.crmAccount.findFirst({
          where: { id: draft.crmAccountId, tenantId },
          select: { name: true },
        })
      : null,
  ]);

  const previewToken = storePreview({
    tenantId,
    userId,
    toolName: "update_invoice_draft_refs",
    args: { draftId, additionalReferences: after, mode },
    computed: {
      before,
      after,
      displayName:
        tpl?.name ||
        [acc?.name, inst?.name].filter(Boolean).join(" — ") ||
        draft.receiverName,
    },
  });

  await logAiAction({
    tenantId,
    userId,
    toolName: "preview_update_invoice_draft_refs",
    args,
    status: "success",
    resultEntityId: draft.id,
    resultEntityType: "finance_dte_draft",
    startedAt: t0,
  });

  return {
    ok: true,
    data: {
      previewToken,
      draftId: draft.id,
      displayName:
        tpl?.name ||
        [acc?.name, inst?.name].filter(Boolean).join(" — ") ||
        draft.receiverName,
      dteTypeLabel: dteTypeLabel(draft.dteType),
      receiverName: draft.receiverName,
      receiverRut: draft.receiverRut,
      netAmount: Number(draft.netAmount),
      totalAmount: Number(draft.totalAmount),
      currency: draft.currency,
      refsBefore: before,
      refsAfter: after,
      refsBeforeLabel: formatRefsLabel(
        before.map((r) => ({
          tipoDocRef: String(r.tipoDocRef),
          folioRef: String(r.folioRef ?? ""),
          fchRef: String(r.fchRef ?? ""),
          razonRef: String(r.razonRef ?? ""),
        })),
      ),
      refsAfterLabel: formatRefsLabel(after),
      mode,
      url: `/finanzas/facturacion/emitir?draftId=${draft.id}`,
      instruction:
        "Mostrá card de preview (badge violeta 'Pendiente confirmación') con refsAfterLabel. Pedí OK y luego llamá update_invoice_draft_refs con previewToken + mismos args.",
    },
  };
}

export async function toolUpdateInvoiceDraftRefs(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue")
  ) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "update_invoice_draft_refs",
      args,
      status: "denied",
      errorMessage: "Sin permiso",
      startedAt: t0,
    });
    return { ok: false, error: "No tienes permiso para editar borradores de factura." };
  }

  const token = typeof args.previewToken === "string" ? args.previewToken : "";
  let draftId = typeof args.draftId === "string" ? args.draftId.trim() : "";
  let mode: "merge" | "replace" = args.mode === "replace" ? "replace" : "merge";
  let finalRefs: BillingRefInput[] | null = null;

  if (token) {
    const payload = consumePreview(
      token,
      tenantId,
      userId,
      "update_invoice_draft_refs",
    );
    if (payload) {
      const pArgs = payload.args;
      draftId =
        typeof pArgs.draftId === "string" ? pArgs.draftId : draftId;
      mode = pArgs.mode === "replace" ? "replace" : "merge";
      finalRefs = sanitizeBillingRefs(pArgs.additionalReferences);
    }
  }

  if (!finalRefs) {
    const incoming = sanitizeBillingRefs(args.additionalReferences);
    if (!draftId || incoming.length === 0) {
      return {
        ok: false,
        error:
          "Faltan datos. Llama primero preview_update_invoice_draft_refs y confirma, o pasa draftId + additionalReferences.",
      };
    }
    const existing = await prisma.financeDte.findFirst({
      where: { id: draftId, tenantId, siiStatus: "DRAFT" },
      select: { additionalReferences: true },
    });
    if (!existing) {
      return { ok: false, error: "Borrador no encontrado o ya emitido." };
    }
    const before = Array.isArray(existing.additionalReferences)
      ? (existing.additionalReferences as DraftAdditionalReference[])
      : [];
    finalRefs = mergeBillingRefs(before, incoming, mode);
  }

  try {
    const updated = await prisma.financeDte.updateMany({
      where: { id: draftId, tenantId, siiStatus: "DRAFT" },
      data: {
        additionalReferences:
          finalRefs.length > 0
            ? (finalRefs as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
    if (updated.count === 0) {
      return { ok: false, error: "Borrador no encontrado o ya emitido." };
    }

    const draft = await prisma.financeDte.findFirst({
      where: { id: draftId, tenantId },
      select: {
        id: true,
        dteType: true,
        receiverName: true,
        receiverRut: true,
        totalAmount: true,
        netAmount: true,
        currency: true,
        additionalReferences: true,
        recurringTemplateId: true,
        installationId: true,
        crmAccountId: true,
      },
    });

    await logAiAction({
      tenantId,
      userId,
      toolName: "update_invoice_draft_refs",
      args,
      status: "success",
      resultEntityId: draftId,
      resultEntityType: "finance_dte_draft",
      startedAt: t0,
    });

    const refs = Array.isArray(draft?.additionalReferences)
      ? (draft!.additionalReferences as DraftAdditionalReference[])
      : [];
    const [tpl, inst, acc] = await Promise.all([
      draft?.recurringTemplateId
        ? prisma.financeDteRecurringTemplate.findFirst({
            where: { id: draft.recurringTemplateId, tenantId },
            select: { name: true },
          })
        : null,
      draft?.installationId
        ? prisma.crmInstallation.findFirst({
            where: { id: draft.installationId, tenantId },
            select: { name: true },
          })
        : null,
      draft?.crmAccountId
        ? prisma.crmAccount.findFirst({
            where: { id: draft.crmAccountId, tenantId },
            select: { name: true },
          })
        : null,
    ]);

    const displayName =
      tpl?.name ||
      [acc?.name, inst?.name].filter(Boolean).join(" — ") ||
      draft?.receiverName ||
      "Borrador";

    return {
      ok: true,
      data: {
        id: draftId,
        displayName,
        dteTypeLabel: dteTypeLabel(draft?.dteType ?? 33),
        receiverName: draft?.receiverName ?? "",
        receiverRut: draft?.receiverRut ?? "",
        netAmount: Number(draft?.netAmount ?? 0),
        totalAmount: Number(draft?.totalAmount ?? 0),
        currency: draft?.currency ?? "CLP",
        additionalReferences: refs,
        refsLabel: formatRefsLabel(
          refs.map((r) => ({
            tipoDocRef: String(r.tipoDocRef),
            folioRef: String(r.folioRef ?? ""),
            fchRef: String(r.fchRef ?? ""),
            razonRef: String(r.razonRef ?? ""),
          })),
        ),
        url: `/finanzas/facturacion/emitir?draftId=${draftId}`,
        urlProgramacion: "/finanzas/facturacion/programacion",
        card: {
          title: displayName,
          subtitle: `${draft?.receiverName ?? ""} · Refs: ${formatRefsLabel(
            refs.map((r) => ({
              tipoDocRef: String(r.tipoDocRef),
              folioRef: String(r.folioRef ?? ""),
              fchRef: String(r.fchRef ?? ""),
              razonRef: String(r.razonRef ?? ""),
            })),
          )}`,
          meta: `$${Number(draft?.netAmount ?? 0).toLocaleString("es-CL")} neto`,
          badge: "Referencias actualizadas",
          badgeColor: "green",
          action: {
            type: "navigate",
            url: `/finanzas/facturacion/emitir?draftId=${draftId}`,
          },
        },
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    await logAiAction({
      tenantId,
      userId,
      toolName: "update_invoice_draft_refs",
      args,
      status: "internal_error",
      errorMessage: msg,
      startedAt: t0,
    });
    return { ok: false, error: `No pude actualizar el borrador: ${msg}` };
  }
}

export async function toolPreviewUpdateRecurringInvoiceRefs(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue") &&
    !hasFacturacionCapability(perms, "facturacion_configure")
  ) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "preview_update_recurring_invoice_refs",
      args,
      status: "denied",
      errorMessage: "Sin permiso",
      startedAt: t0,
    });
    return { ok: false, error: "No tienes permiso para editar plantillas recurrentes." };
  }

  const templateId =
    typeof args.templateId === "string" ? args.templateId.trim() : "";
  if (!templateId) return { ok: false, error: "Falta templateId." };
  const incoming = sanitizeBillingRefs(args.additionalReferences);
  if (incoming.length === 0) {
    return { ok: false, error: "Debes pasar al menos una referencia válida." };
  }
  const mode = args.mode === "replace" ? "replace" : "merge";

  const tpl = await prisma.financeDteRecurringTemplate.findFirst({
    where: { id: templateId, tenantId },
    select: {
      id: true,
      name: true,
      dteType: true,
      receiverName: true,
      receiverRut: true,
      additionalReferences: true,
      isActive: true,
    },
  });
  if (!tpl) {
    return {
      ok: false,
      error: "Plantilla no encontrada. Usa search_recurring_invoices.",
    };
  }

  const before = Array.isArray(tpl.additionalReferences)
    ? (tpl.additionalReferences as DraftAdditionalReference[])
    : [];
  const after = mergeBillingRefs(before, incoming, mode);

  const previewToken = storePreview({
    tenantId,
    userId,
    toolName: "update_recurring_invoice_refs",
    args: { templateId, additionalReferences: after, mode },
    computed: { before, after, name: tpl.name },
  });

  await logAiAction({
    tenantId,
    userId,
    toolName: "preview_update_recurring_invoice_refs",
    args,
    status: "success",
    resultEntityId: tpl.id,
    resultEntityType: "finance_dte_recurring_template",
    startedAt: t0,
  });

  return {
    ok: true,
    data: {
      previewToken,
      templateId: tpl.id,
      name: tpl.name,
      dteTypeLabel: dteTypeLabel(tpl.dteType),
      receiverName: tpl.receiverName,
      receiverRut: tpl.receiverRut,
      isActive: tpl.isActive,
      refsBefore: before,
      refsAfter: after,
      refsBeforeLabel: formatRefsLabel(
        before.map((r) => ({
          tipoDocRef: String(r.tipoDocRef),
          folioRef: String(r.folioRef ?? ""),
          fchRef: String(r.fchRef ?? ""),
          razonRef: String(r.razonRef ?? ""),
        })),
      ),
      refsAfterLabel: formatRefsLabel(after),
      mode,
      url: "/finanzas/facturacion/programacion",
      instruction:
        "Mostrá preview y pedí OK. Luego update_recurring_invoice_refs. Si el usuario habla del borrador del mes en 'Borradores pendientes', preferí update_invoice_draft_refs.",
    },
  };
}

export async function toolUpdateRecurringInvoiceRefs(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (
    !hasFacturacionCapability(perms, "facturacion_create_draft") &&
    !hasFacturacionCapability(perms, "facturacion_issue") &&
    !hasFacturacionCapability(perms, "facturacion_configure")
  ) {
    await logAiAction({
      tenantId,
      userId,
      toolName: "update_recurring_invoice_refs",
      args,
      status: "denied",
      errorMessage: "Sin permiso",
      startedAt: t0,
    });
    return { ok: false, error: "No tienes permiso para editar plantillas recurrentes." };
  }

  const token = typeof args.previewToken === "string" ? args.previewToken : "";
  let templateId =
    typeof args.templateId === "string" ? args.templateId.trim() : "";
  let mode: "merge" | "replace" = args.mode === "replace" ? "replace" : "merge";
  let finalRefs: BillingRefInput[] | null = null;

  if (token) {
    const payload = consumePreview(
      token,
      tenantId,
      userId,
      "update_recurring_invoice_refs",
    );
    if (payload) {
      const pArgs = payload.args;
      templateId =
        typeof pArgs.templateId === "string" ? pArgs.templateId : templateId;
      mode = pArgs.mode === "replace" ? "replace" : "merge";
      finalRefs = sanitizeBillingRefs(pArgs.additionalReferences);
    }
  }

  if (!finalRefs) {
    const incoming = sanitizeBillingRefs(args.additionalReferences);
    if (!templateId || incoming.length === 0) {
      return {
        ok: false,
        error:
          "Faltan datos. Llama primero preview_update_recurring_invoice_refs o pasa templateId + additionalReferences.",
      };
    }
    const existing = await prisma.financeDteRecurringTemplate.findFirst({
      where: { id: templateId, tenantId },
      select: { additionalReferences: true },
    });
    if (!existing) return { ok: false, error: "Plantilla no encontrada." };
    const before = Array.isArray(existing.additionalReferences)
      ? (existing.additionalReferences as DraftAdditionalReference[])
      : [];
    finalRefs = mergeBillingRefs(before, incoming, mode);
  }

  try {
    const updated = await prisma.financeDteRecurringTemplate.updateMany({
      where: { id: templateId, tenantId },
      data: {
        additionalReferences:
          finalRefs.length > 0
            ? (finalRefs as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
    if (updated.count === 0) {
      return { ok: false, error: "Plantilla no encontrada." };
    }

    const tpl = await prisma.financeDteRecurringTemplate.findFirst({
      where: { id: templateId, tenantId },
      select: {
        id: true,
        name: true,
        dteType: true,
        receiverName: true,
        receiverRut: true,
        additionalReferences: true,
      },
    });

    await logAiAction({
      tenantId,
      userId,
      toolName: "update_recurring_invoice_refs",
      args,
      status: "success",
      resultEntityId: templateId,
      resultEntityType: "finance_dte_recurring_template",
      startedAt: t0,
    });

    const refs = Array.isArray(tpl?.additionalReferences)
      ? (tpl!.additionalReferences as DraftAdditionalReference[])
      : [];
    const refsLabel = formatRefsLabel(
      refs.map((r) => ({
        tipoDocRef: String(r.tipoDocRef),
        folioRef: String(r.folioRef ?? ""),
        fchRef: String(r.fchRef ?? ""),
        razonRef: String(r.razonRef ?? ""),
      })),
    );

    return {
      ok: true,
      data: {
        id: templateId,
        name: tpl?.name ?? "",
        dteTypeLabel: dteTypeLabel(tpl?.dteType ?? 33),
        receiverName: tpl?.receiverName ?? "",
        receiverRut: tpl?.receiverRut ?? "",
        additionalReferences: refs,
        refsLabel,
        url: "/finanzas/facturacion/programacion",
        card: {
          title: tpl?.name ?? "Plantilla",
          subtitle: `Refs: ${refsLabel}`,
          badge: "Plantilla actualizada",
          badgeColor: "green",
          action: {
            type: "navigate",
            url: "/finanzas/facturacion/programacion",
          },
        },
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    await logAiAction({
      tenantId,
      userId,
      toolName: "update_recurring_invoice_refs",
      args,
      status: "internal_error",
      errorMessage: msg,
      startedAt: t0,
    });
    return { ok: false, error: `No pude actualizar la plantilla: ${msg}` };
  }
}
