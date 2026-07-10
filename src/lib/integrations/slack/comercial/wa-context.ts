/**
 * Contexto de entidades para resolver plantillas WhatsApp desde Slack.
 *
 * Las tarjetas de Slack llaman `getWaTemplate` directamente (sin pasar por
 * `/api/whatsapp/resolve-template`), por lo que deben armar explícitamente
 * `tenant` y `actor` además de contact/account/lead.
 */

import { prisma } from "@/lib/prisma";
import type { EntityData } from "@/lib/docs/token-resolver";
import { getWaTemplate, buildWaUrl } from "@/lib/whatsapp-templates";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

/** Datos de empresa-marca para tokens `{{tenant.*}}`. */
export async function buildTenantWaEntity(tenantId: string): Promise<NonNullable<EntityData["tenant"]>> {
  const cfg = await getTenantCompanyConfig(tenantId);
  return {
    commercialName: cfg.commercialName,
    website: cfg.website,
    phone: cfg.phone,
    email: cfg.email,
    whatsappLink: cfg.whatsappLink,
  };
}

/** Datos del ejecutivo para tokens `{{actor.*}}`. */
export async function buildActorWaEntity(
  adminId: string | null | undefined,
  tenantId: string,
): Promise<EntityData["actor"] | undefined> {
  if (!adminId) return undefined;
  const admin = await prisma.admin.findFirst({
    where: { id: adminId, tenantId },
    select: { name: true, email: true, cargo: true },
  });
  if (!admin) return undefined;
  const parts = (admin.name || "").trim().split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
    name: admin.name,
    email: admin.email,
    roleTitle: admin.cargo || "",
  };
}

/** Admin que envió la cotización por portal (último `quote_sent_portal`). */
export async function resolveQuoteSenderAdminId(
  tenantId: string,
  quoteId: string,
): Promise<string | null> {
  const log = await prisma.crmHistoryLog.findFirst({
    where: {
      tenantId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote_sent_portal",
    },
    orderBy: { createdAt: "desc" },
    select: { createdBy: true },
  });
  return log?.createdBy ?? null;
}

export interface BuildSlackWaEntitiesOptions {
  /** Admin vinculado que hace clic (prioridad sobre quoteSender). */
  adminId?: string | null;
  /** Si hay cotización, usar el remitente del último envío como actor. */
  quoteId?: string | null;
}

/** Arma EntityData completa para plantillas WA en Slack. */
export async function buildSlackWaEntities(
  tenantId: string,
  partial: EntityData = {},
  options: BuildSlackWaEntitiesOptions = {},
): Promise<EntityData> {
  const tenant = await buildTenantWaEntity(tenantId);
  let actorAdminId = options.adminId ?? null;
  if (!actorAdminId && options.quoteId) {
    actorAdminId = await resolveQuoteSenderAdminId(tenantId, options.quoteId);
  }
  const actor = await buildActorWaEntity(actorAdminId, tenantId);
  return {
    ...partial,
    tenant,
    ...(actor ? { actor } : {}),
  };
}

/** Resuelve plantilla + URL wa.me para tarjetas Slack. */
export async function resolveSlackWaUrl(
  tenantId: string,
  slug: string,
  phone: string | null,
  partial: EntityData = {},
  options: BuildSlackWaEntitiesOptions = {},
): Promise<string | null> {
  if (!phone) return null;
  const entities = await buildSlackWaEntities(tenantId, partial, options);
  const message = await getWaTemplate(tenantId, slug, { entities }).catch(() => "");
  return buildWaUrl((message ?? "").trim(), phone);
}
