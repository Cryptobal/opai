/**
 * API Route: /api/notifications
 * GET    - Listar notificaciones del tenant
 * PATCH  - Marcar notificaciones como leídas
 * DELETE - Eliminar notificaciones (todas o por IDs)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { addDays } from "date-fns";
import {
  NOTIFICATION_TYPE_MAP,
  NOTIFICATION_TYPES,
  canSeeNotificationType,
  type UserNotifPrefsMap,
} from "@/lib/notification-types";
import { getGuardiaDocumentosConfig } from "@/lib/guardia-documentos-config";
import type { AuthContext } from "@/lib/api-auth";
import type { Prisma } from "@prisma/client";

type SourceModuleKey =
  | "lead"
  | "negocio"
  | "cotizacion"
  | "contrato"
  | "operaciones"
  | "guardia"
  | "cuenta"
  | "contacto"
  | "instalacion"
  | "documentos"
  | "crm"
  | "finanzas"
  | "payroll"
  | "configuracion"
  | "hub"
  | "sistema";

type SourceLookups = {
  leads: Map<string, string>;
  accounts: Map<string, string>;
  deals: Map<string, string>;
  quotes: Map<string, string>;
  documents: Map<string, string>;
  tickets: Map<string, string>;
  installations: Map<string, string>;
  guardias: Map<string, string>;
  contacts: Map<string, string>;
};

const SOURCE_MODULE_LABELS: Record<SourceModuleKey, string> = {
  lead: "Lead",
  negocio: "Negocio",
  cotizacion: "Cotización",
  contrato: "Contrato",
  operaciones: "Operaciones",
  guardia: "Guardia",
  cuenta: "Cuenta",
  contacto: "Contacto",
  instalacion: "Instalación",
  documentos: "Documentos",
  crm: "CRM",
  finanzas: "Finanzas",
  payroll: "Payroll",
  configuracion: "Configuración",
  hub: "Hub",
  sistema: "Sistema",
};

const NON_SYSTEM_TYPES = new Set([
  "mention",
  "mention_direct",
  "mention_group",
  "note_thread_reply",
  "ticket_mention",
]);

const TYPE_SOURCE_MODULE: Record<string, SourceModuleKey> = {
  new_lead: "lead",
  lead_approved: "lead",
  mention: "crm",
  mention_direct: "crm",
  mention_group: "crm",
  note_thread_reply: "crm",
  email_opened: "negocio",
  email_clicked: "negocio",
  email_bounced: "negocio",
  followup_sent: "negocio",
  followup_scheduled: "negocio",
  followup_failed: "negocio",
  quote_sent: "cotizacion",
  quote_viewed: "cotizacion",
  contract_required: "contrato",
  contract_expiring: "contrato",
  contract_expired: "contrato",
  document_signed_completed: "contrato",
  guardia_doc_expiring: "guardia",
  guardia_doc_expired: "guardia",
  new_postulacion: "guardia",
  refuerzo_solicitud_created: "operaciones",
  ticket_created: "operaciones",
  ticket_approved: "operaciones",
  ticket_rejected: "operaciones",
  ticket_sla_breached: "operaciones",
  ticket_sla_approaching: "operaciones",
  ticket_mention: "operaciones",
};

function asObject(data: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return data as Record<string, unknown>;
}

function getDataString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function getDataBoolean(data: Record<string, unknown>, key: string): boolean | null {
  const value = data[key];
  if (typeof value === "boolean") return value;
  return null;
}

function tryAdd(set: Set<string>, value: string | null) {
  if (value) set.add(value);
}

function mapEntityTypeToModule(entityType: string | null): SourceModuleKey | null {
  if (!entityType) return null;
  const normalized = entityType.toLowerCase();
  if (normalized === "lead") return "lead";
  if (normalized === "deal") return "negocio";
  if (normalized === "quote") return "cotizacion";
  if (normalized === "account") return "cuenta";
  if (normalized === "contact") return "contacto";
  if (normalized === "installation") return "instalacion";
  if (normalized === "ops_guardia") return "guardia";
  if (normalized === "installation_pauta") return "operaciones";
  return null;
}

function mapPermissionModuleToSource(moduleKey: string | null | undefined): SourceModuleKey | null {
  if (!moduleKey) return null;
  if (moduleKey === "crm") return "crm";
  if (moduleKey === "ops") return "operaciones";
  if (moduleKey === "docs") return "documentos";
  if (moduleKey === "cpq") return "cotizacion";
  if (moduleKey === "finance") return "finanzas";
  if (moduleKey === "payroll") return "payroll";
  if (moduleKey === "config") return "configuracion";
  if (moduleKey === "hub") return "hub";
  return null;
}

function mapLinkToSourceModule(link: string | null | undefined): SourceModuleKey | null {
  if (!link) return null;
  if (link.startsWith("/crm/leads")) return "lead";
  if (link.startsWith("/crm/deals")) return "negocio";
  if (link.startsWith("/crm/cotizaciones")) return "cotizacion";
  if (link.startsWith("/crm/accounts")) return "cuenta";
  if (link.startsWith("/crm/contacts")) return "contacto";
  if (link.startsWith("/crm/installations")) return "instalacion";
  if (link.startsWith("/ops") || link.startsWith("/personas/guardias")) return "operaciones";
  if (link.startsWith("/opai/documentos")) return "contrato";
  if (link.startsWith("/finanzas")) return "finanzas";
  if (link.startsWith("/payroll")) return "payroll";
  if (link.startsWith("/opai/configuracion")) return "configuracion";
  return null;
}

function parseTitleContext(title: string | null | undefined): string | null {
  if (!title) return null;
  const normalized = title.trim();
  if (!normalized) return null;
  const idx = normalized.indexOf(":");
  if (idx <= 0 || idx >= normalized.length - 1) return null;
  return normalized.slice(idx + 1).trim() || null;
}

function normalizeSourceModule(raw: string | null): SourceModuleKey | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === "lead" || value === "leads") return "lead";
  if (value === "negocio" || value === "deal" || value === "deals") return "negocio";
  if (value === "cotizacion" || value === "cotización" || value === "quote" || value === "quotes")
    return "cotizacion";
  if (value === "contrato" || value === "contract" || value === "contracts") return "contrato";
  if (value === "operaciones" || value === "ops") return "operaciones";
  if (value === "guardia" || value === "guardias") return "guardia";
  if (value === "cuenta" || value === "account" || value === "accounts") return "cuenta";
  if (value === "contacto" || value === "contact" || value === "contacts") return "contacto";
  if (value === "instalacion" || value === "instalación" || value === "installation")
    return "instalacion";
  if (value === "crm") return "crm";
  if (value === "documentos" || value === "docs") return "documentos";
  if (value === "finanzas" || value === "finance") return "finanzas";
  if (value === "payroll") return "payroll";
  if (value === "configuracion" || value === "configuración" || value === "config")
    return "configuracion";
  if (value === "hub") return "hub";
  if (value === "sistema" || value === "system") return "sistema";
  return null;
}

async function buildSourceLookups(
  tenantId: string,
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    data: Prisma.JsonValue | null;
    link: string | null;
  }>
): Promise<SourceLookups> {
  const leadIds = new Set<string>();
  const accountIds = new Set<string>();
  const dealIds = new Set<string>();
  const quoteIds = new Set<string>();
  const documentIds = new Set<string>();
  const ticketIds = new Set<string>();
  const installationIds = new Set<string>();
  const guardiaIds = new Set<string>();
  const contactIds = new Set<string>();

  for (const notification of notifications) {
    const data = asObject(notification.data);
    tryAdd(leadIds, getDataString(data, "leadId"));
    tryAdd(accountIds, getDataString(data, "accountId"));
    tryAdd(dealIds, getDataString(data, "dealId"));
    tryAdd(quoteIds, getDataString(data, "quoteId"));
    tryAdd(documentIds, getDataString(data, "documentId"));
    tryAdd(ticketIds, getDataString(data, "ticketId"));
    tryAdd(installationIds, getDataString(data, "installationId"));
    tryAdd(guardiaIds, getDataString(data, "guardiaId"));
    tryAdd(contactIds, getDataString(data, "contactId"));

    const entityType = getDataString(data, "entityType")?.toLowerCase() ?? null;
    const entityId = getDataString(data, "entityId");
    if (!entityType || !entityId) continue;

    if (entityType === "lead") tryAdd(leadIds, entityId);
    if (entityType === "account") tryAdd(accountIds, entityId);
    if (entityType === "deal") tryAdd(dealIds, entityId);
    if (entityType === "quote") tryAdd(quoteIds, entityId);
    if (entityType === "contact") tryAdd(contactIds, entityId);
    if (entityType === "installation") tryAdd(installationIds, entityId);
    if (entityType === "ops_guardia") tryAdd(guardiaIds, entityId);
    if (entityType === "installation_pauta") {
      const [installationId] = entityId.split("_");
      tryAdd(installationIds, installationId || null);
    }
  }

  const [
    leads,
    accounts,
    deals,
    quotes,
    documents,
    tickets,
    installations,
    guardias,
    contacts,
  ] = await Promise.all([
    leadIds.size > 0
      ? prisma.crmLead.findMany({
          where: { tenantId, id: { in: Array.from(leadIds) } },
          select: { id: true, companyName: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
    accountIds.size > 0
      ? prisma.crmAccount.findMany({
          where: { tenantId, id: { in: Array.from(accountIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    dealIds.size > 0
      ? prisma.crmDeal.findMany({
          where: { tenantId, id: { in: Array.from(dealIds) } },
          select: { id: true, title: true, account: { select: { name: true } } },
        })
      : Promise.resolve([]),
    quoteIds.size > 0
      ? prisma.cpqQuote.findMany({
          where: { tenantId, id: { in: Array.from(quoteIds) } },
          select: { id: true, code: true, clientName: true },
        })
      : Promise.resolve([]),
    documentIds.size > 0
      ? prisma.document.findMany({
          where: { tenantId, id: { in: Array.from(documentIds) } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    ticketIds.size > 0
      ? prisma.opsTicket.findMany({
          where: { tenantId, id: { in: Array.from(ticketIds) } },
          select: { id: true, code: true, title: true },
        })
      : Promise.resolve([]),
    installationIds.size > 0
      ? prisma.crmInstallation.findMany({
          where: { tenantId, id: { in: Array.from(installationIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    guardiaIds.size > 0
      ? prisma.opsGuardia.findMany({
          where: { tenantId, id: { in: Array.from(guardiaIds) } },
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
    contactIds.size > 0
      ? prisma.crmContact.findMany({
          where: { tenantId, id: { in: Array.from(contactIds) } },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve([]),
  ]);

  const leadMap = new Map<string, string>();
  for (const lead of leads) {
    const fullName = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim();
    const name = lead.companyName?.trim() || fullName;
    if (name) leadMap.set(lead.id, name);
  }

  const accountMap = new Map<string, string>();
  for (const account of accounts) {
    if (account.name?.trim()) accountMap.set(account.id, account.name.trim());
  }

  const dealMap = new Map<string, string>();
  for (const deal of deals) {
    const name = deal.account?.name?.trim() || deal.title?.trim();
    if (name) dealMap.set(deal.id, name);
  }

  const quoteMap = new Map<string, string>();
  for (const quote of quotes) {
    const name = quote.clientName?.trim() || quote.code?.trim();
    if (name) quoteMap.set(quote.id, name);
  }

  const documentMap = new Map<string, string>();
  for (const document of documents) {
    if (document.title?.trim()) documentMap.set(document.id, document.title.trim());
  }

  const ticketMap = new Map<string, string>();
  for (const ticket of tickets) {
    const name = ticket.code?.trim() || ticket.title?.trim();
    if (name) ticketMap.set(ticket.id, name);
  }

  const installationMap = new Map<string, string>();
  for (const installation of installations) {
    if (installation.name?.trim()) installationMap.set(installation.id, installation.name.trim());
  }

  const guardiaMap = new Map<string, string>();
  for (const guardia of guardias) {
    const personName = `${guardia.persona?.firstName ?? ""} ${guardia.persona?.lastName ?? ""}`.trim();
    const name = personName || guardia.code?.trim();
    if (name) guardiaMap.set(guardia.id, name);
  }

  const contactMap = new Map<string, string>();
  for (const contact of contacts) {
    const fullName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim();
    if (fullName) contactMap.set(contact.id, fullName);
  }

  return {
    leads: leadMap,
    accounts: accountMap,
    deals: dealMap,
    quotes: quoteMap,
    documents: documentMap,
    tickets: ticketMap,
    installations: installationMap,
    guardias: guardiaMap,
    contacts: contactMap,
  };
}

function resolveSourceContext(
  notification: {
    type: string;
    title: string;
    message: string | null;
    data: Prisma.JsonValue | null;
    link: string | null;
  },
  lookups: SourceLookups
) {
  const data = asObject(notification.data);
  const entityType = getDataString(data, "entityType")?.toLowerCase() ?? null;
  const entityId = getDataString(data, "entityId");

  const explicitModule = normalizeSourceModule(
    getDataString(data, "sourceModule") || getDataString(data, "source_module")
  );
  let sourceModule =
    explicitModule ||
    mapEntityTypeToModule(entityType) ||
    TYPE_SOURCE_MODULE[notification.type] ||
    mapPermissionModuleToSource(NOTIFICATION_TYPE_MAP.get(notification.type)?.module) ||
    mapLinkToSourceModule(notification.link) ||
    "sistema";

  let sourceRecordName =
    getDataString(data, "sourceRecordName") ||
    getDataString(data, "source_record_name") ||
    null;

  if (!sourceRecordName && entityType && entityId) {
    if (entityType === "lead") sourceRecordName = lookups.leads.get(entityId) || null;
    if (entityType === "account") sourceRecordName = lookups.accounts.get(entityId) || null;
    if (entityType === "deal") sourceRecordName = lookups.deals.get(entityId) || null;
    if (entityType === "quote") sourceRecordName = lookups.quotes.get(entityId) || null;
    if (entityType === "contact") sourceRecordName = lookups.contacts.get(entityId) || null;
    if (entityType === "installation")
      sourceRecordName = lookups.installations.get(entityId) || null;
    if (entityType === "ops_guardia") sourceRecordName = lookups.guardias.get(entityId) || null;
    if (entityType === "installation_pauta") {
      const [installationId] = entityId.split("_");
      sourceRecordName = lookups.installations.get(installationId) || null;
      sourceModule = "operaciones";
    }
  }

  if (!sourceRecordName) {
    const leadId = getDataString(data, "leadId");
    const dealId = getDataString(data, "dealId");
    const quoteId = getDataString(data, "quoteId");
    const documentId = getDataString(data, "documentId");
    const ticketId = getDataString(data, "ticketId");
    const accountId = getDataString(data, "accountId");
    const guardiaId = getDataString(data, "guardiaId");
    const installationId = getDataString(data, "installationId");

    sourceRecordName =
      getDataString(data, "accountName") ||
      getDataString(data, "company") ||
      getDataString(data, "dealTitle") ||
      (leadId ? lookups.leads.get(leadId) || null : null) ||
      (dealId ? lookups.deals.get(dealId) || null : null) ||
      (quoteId ? lookups.quotes.get(quoteId) || null : null) ||
      (documentId ? lookups.documents.get(documentId) || null : null) ||
      (ticketId ? lookups.tickets.get(ticketId) || null : null) ||
      (accountId ? lookups.accounts.get(accountId) || null : null) ||
      (guardiaId ? lookups.guardias.get(guardiaId) || null : null) ||
      (installationId ? lookups.installations.get(installationId) || null : null);
  }

  if (!sourceRecordName) {
    if (notification.type === "refuerzo_solicitud_created" && notification.message) {
      const [installationName] = notification.message.split("·");
      if (installationName?.trim()) sourceRecordName = installationName.trim();
    } else {
      sourceRecordName = parseTitleContext(notification.title);
    }
  }

  if (
    sourceModule === "crm" &&
    (notification.type === "mention" ||
      notification.type === "mention_direct" ||
      notification.type === "mention_group" ||
      notification.type === "note_thread_reply")
  ) {
    sourceModule = mapEntityTypeToModule(entityType) || "crm";
  }

  const titleIndicatesContract =
    notification.title.toLowerCase().includes("contrato") ||
    notification.type.startsWith("contract_");
  if (titleIndicatesContract && sourceModule === "documentos") {
    sourceModule = "contrato";
  }

  const sourceModuleLabel = SOURCE_MODULE_LABELS[sourceModule] || "Sistema";
  const isSystemExplicit = getDataBoolean(data, "isSystem");
  const isSystem = isSystemExplicit ?? !NON_SYSTEM_TYPES.has(notification.type);

  return {
    sourceModule,
    sourceModuleLabel,
    sourceRecordName,
    isSystem,
  };
}

async function getRoleExcludedNotificationTypes(ctx: AuthContext): Promise<string[]> {
  const perms = await resolveApiPerms(ctx);
  return NOTIFICATION_TYPES
    .filter((t) => !canSeeNotificationType(perms, t))
    .map((t) => t.key);
}

async function getUserBellDisabledTypes(ctx: AuthContext): Promise<string[]> {
  const record = await prisma.userNotificationPreference.findUnique({
    where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
  });
  if (!record?.preferences) return [];
  const prefs = record.preferences as unknown as UserNotifPrefsMap;
  return Object.entries(prefs)
    .filter(([, pref]) => pref.bell === false)
    .map(([key]) => key);
}

function visibleNotificationsWhere(
  ctx: AuthContext,
  roleExcludedTypes: string[],
  options?: { unreadOnly?: boolean; read?: boolean; ids?: string[]; types?: string[] }
): Prisma.NotificationWhereInput {
  const { unreadOnly = false, read, ids, types } = options || {};
  // Note-related types (mention_direct, mention_group, note_thread_reply, note_alert)
  // are handled exclusively by the Activity feed, not legacy Notificaciones.
  const baseExclusions = roleExcludedTypes.filter(
    (type) =>
      type !== "mention"
  );
  // Types that use targeted delivery (only visible to specific users via data.targetUserId)
  const targetedTypes = [
    "ticket_approved",
    "ticket_rejected",
    "refuerzo_solicitud_created",
    "mention",
    "ticket_mention",
    "ticket_created",
  ];

  const orConditions: Prisma.NotificationWhereInput[] = [
    {
      // Eventos generales del tenant, respetando exclusiones por módulo/rol.
      // Excluimos targeted types aquí; se agregan con filtro de usuario abajo.
      type: {
        notIn:
          baseExclusions.length > 0
            ? [...baseExclusions, ...targetedTypes]
            : targetedTypes,
      },
    },
  ];

  // Menciones legacy: visibles para el usuario mencionado (targetUserId o mentionUserId).
  orConditions.push({
    type: "mention",
    OR: [
      { data: { path: ["targetUserId"], equals: ctx.userId } },
      { data: { path: ["mentionUserId"], equals: ctx.userId } },
    ],
  });

  // Targeted notifications: solo visibles para el usuario destinatario.
  // Si tienen data.targetUserId, solo ese usuario las ve. Si no lo tienen (legacy), se muestran a todos.
  // Note: mention_direct, mention_group, note_thread_reply, note_alert are excluded —
  // they are handled by the Activity feed module, not legacy Notificaciones.
  for (const targetedType of [
    "ticket_approved",
    "ticket_rejected",
    "refuerzo_solicitud_created",
    "ticket_mention",
    "ticket_created",
  ]) {
    if (baseExclusions.includes(targetedType)) continue; // Skip if role excludes it
    orConditions.push({
      type: targetedType,
      data: { path: ["targetUserId"], equals: ctx.userId },
    });
  }

  return {
    tenantId: ctx.tenantId,
    ...(ids?.length ? { id: { in: ids } } : {}),
    ...(typeof read === "boolean" ? { read } : unreadOnly ? { read: false } : {}),
    ...(types?.length ? { type: { in: types } } : {}),
    OR: orConditions,
  };
}

async function ensureGuardiaDocExpiryNotifications(tenantId: string, enabled: boolean) {
  if (!enabled) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const config = await getGuardiaDocumentosConfig(tenantId);
  const byType = new Map(config.filter((c) => c.hasExpiration).map((c) => [c.code, c.alertDaysBefore]));

  const maxDays = Math.max(30, ...Array.from(byType.values()));
  const limitDate = addDays(today, maxDays);

  const docs = await prisma.opsDocumentoPersona.findMany({
    where: {
      tenantId,
      expiresAt: { not: null, lte: limitDate },
      status: { not: "vencido" },
    },
    include: {
      guardia: {
        include: {
          persona: { select: { firstName: true, lastName: true } },
        },
      },
    },
    take: 200,
  });

  for (const doc of docs) {
    if (!doc.expiresAt) continue;
    const alertDays = byType.get(doc.type);
    if (alertDays === undefined) continue;
    const expiresAt = new Date(doc.expiresAt);
    const daysRemaining = Math.ceil(
      (expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysRemaining > alertDays) continue;
    const type = daysRemaining < 0 ? "guardia_doc_expired" : "guardia_doc_expiring";
    const personName = `${doc.guardia.persona.firstName} ${doc.guardia.persona.lastName}`.trim();
    const title =
      daysRemaining < 0
        ? `Documento vencido de guardia: ${personName}`
        : `Documento por vencer de guardia: ${personName}`;
    const message =
      daysRemaining < 0
        ? `${doc.type} venció y requiere renovación.`
        : `${doc.type} vence en ${daysRemaining} día(s).`;

    const existing = await prisma.notification.findFirst({
      where: {
        tenantId,
        type,
        data: { path: ["guardiaDocumentId"], equals: doc.id },
        createdAt: { gte: addDays(today, -1) },
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.notification.create({
      data: {
        tenantId,
        type,
        title,
        message,
        link: `/personas/guardias/${doc.guardiaId}`,
        data: {
          guardiaId: doc.guardiaId,
          guardiaDocumentId: doc.id,
          expiresAt: doc.expiresAt,
          docType: doc.type,
        },
      },
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const types = (searchParams.get("types") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    await ensureGuardiaDocExpiryNotifications(ctx.tenantId, true);

    const excludedTypes = new Set<string>(await getRoleExcludedNotificationTypes(ctx));
    const userDisabled = await getUserBellDisabledTypes(ctx);
    for (const t of userDisabled) excludedTypes.add(t);
    const excludedTypesList = Array.from(excludedTypes);
    const notificationsWhere = visibleNotificationsWhere(ctx, excludedTypesList, {
      unreadOnly,
      types,
    });

    const notifications = await prisma.notification.findMany({
      where: notificationsWhere,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const sourceLookups = await buildSourceLookups(ctx.tenantId, notifications);
    const enrichedNotifications = notifications.map((notification) => {
      const sourceContext = resolveSourceContext(notification, sourceLookups);
      return {
        ...notification,
        source_module: sourceContext.sourceModule,
        sourceModule: sourceContext.sourceModule,
        source_module_label: sourceContext.sourceModuleLabel,
        sourceModuleLabel: sourceContext.sourceModuleLabel,
        source_record_name: sourceContext.sourceRecordName,
        sourceRecordName: sourceContext.sourceRecordName,
        is_system: sourceContext.isSystem,
        isSystem: sourceContext.isSystem,
      };
    });

    const unreadCount = await prisma.notification.count({
      where: visibleNotificationsWhere(ctx, excludedTypesList, {
        unreadOnly: true,
        types,
      }),
    });

    return NextResponse.json({
      success: true,
      data: enrichedNotifications,
      meta: { unreadCount },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const roleExcludedTypes = await getRoleExcludedNotificationTypes(ctx);

    const body = await request.json();

    const readValue = typeof body.read === "boolean" ? body.read : true;

    if (body.markAllRead || body.markAllUnread) {
      // Mark all notifications as read/unread
      const where = body.markAllUnread
        ? visibleNotificationsWhere(ctx, roleExcludedTypes, { read: true })
        : visibleNotificationsWhere(ctx, roleExcludedTypes, { unreadOnly: true });
      await prisma.notification.updateMany({
        where,
        data: { read: body.markAllUnread ? false : true },
      });
    } else if (body.ids && Array.isArray(body.ids)) {
      // Mark specific notifications read/unread
      await prisma.notification.updateMany({
        where: visibleNotificationsWhere(ctx, roleExcludedTypes, { ids: body.ids }),
        data: { read: readValue },
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Provide 'markAllRead: true', 'markAllUnread: true' or 'ids: string[]'",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating notifications:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const roleExcludedTypes = await getRoleExcludedNotificationTypes(ctx);

    const body = await request.json();

    if (body.deleteAll) {
      await prisma.notification.deleteMany({
        where: visibleNotificationsWhere(ctx, roleExcludedTypes),
      });
    } else if (body.ids && Array.isArray(body.ids)) {
      await prisma.notification.deleteMany({
        where: visibleNotificationsWhere(ctx, roleExcludedTypes, { ids: body.ids }),
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Provide 'deleteAll: true' or 'ids: string[]'" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete notifications" },
      { status: 500 }
    );
  }
}
