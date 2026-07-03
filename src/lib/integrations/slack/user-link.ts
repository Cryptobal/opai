/**
 * Vínculo usuario Slack ↔ Admin de OPAI.
 *
 * Toda ejecución de tools del bot corre con la identidad del Admin vinculado
 * (permisos reales, NO permisos del bot). Un usuario Slack sin vínculo obtiene
 * cero datos: sólo el flujo de vinculación.
 *
 * Resolución:
 *   1. `SlackUserLink` existente → Admin activo + permisos.
 *   2. Sin vínculo → `users.info` (email) → Admin del tenant por email
 *      (case-insensitive, activo). Match → crea el vínculo (auditado).
 *   3. Sin match → null (se responde con el prompt de vinculación manual).
 */

import { prisma } from "@/lib/prisma";
import type { RolePermissions } from "@/lib/permissions";
import { resolvePermissionsById } from "@/lib/permissions-server";
import { logAudit } from "@/lib/audit";
import { signCookie } from "@/lib/cookie-signature";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import type { ActiveWorkspace } from "./workspace";
import { slackUserInfo } from "./api";

export interface LinkedAdmin {
  adminId: string;
  perms: RolePermissions;
}

/** TTL del token firmado del enlace de vinculación manual. */
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * Resuelve el Admin vinculado a un usuario Slack, creando el vínculo por email
 * si es la primera interacción y hay match. Devuelve null si no hay match
 * (usuario debe vincularse manualmente).
 */
export async function resolveLinkedAdmin(
  workspace: ActiveWorkspace,
  slackUserId: string,
): Promise<LinkedAdmin | null> {
  // 1. Vínculo existente.
  const existing = await prisma.slackUserLink.findUnique({
    where: { workspaceId_slackUserId: { workspaceId: workspace.id, slackUserId } },
    select: { adminId: true },
  });
  if (existing) {
    const admin = await prisma.admin.findFirst({
      where: { id: existing.adminId, tenantId: workspace.tenantId, status: "active" },
      select: { id: true },
    });
    if (!admin) return null; // vínculo apunta a un admin inactivo/otro tenant → fail-closed
    return { adminId: admin.id, perms: await resolvePermissionsById(admin.id) };
  }

  // 2. Auto-vínculo por email.
  const info = await slackUserInfo(workspace.botToken, slackUserId);
  const email = info?.email?.trim();
  if (!email || info?.isBot) return null;

  const admin = await prisma.admin.findFirst({
    where: {
      tenantId: workspace.tenantId,
      status: "active",
      email: { equals: email, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (!admin) return null;

  // Crea el vínculo (idempotente ante carreras por el unique ws+user).
  try {
    await prisma.slackUserLink.create({
      data: {
        tenantId: workspace.tenantId,
        workspaceId: workspace.id,
        slackUserId,
        adminId: admin.id,
        slackEmail: email,
      },
    });
    await logAudit({
      action: "CREATE",
      entity: "SlackUserLink",
      entityId: admin.id,
      tenantId: workspace.tenantId,
      userId: admin.id,
      details: { slackUserId, via: "email_auto", email },
    });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
  }

  return { adminId: admin.id, perms: await resolvePermissionsById(admin.id) };
}

/** Reverso adminId → slackUserId (para mencionar `<@U...>` al responsable si está vinculado). */
export async function getSlackUserIdForAdmin(workspace: ActiveWorkspace, adminId: string): Promise<string | null> {
  const link = await prisma.slackUserLink.findFirst({
    where: { workspaceId: workspace.id, adminId },
    select: { slackUserId: true },
  });
  return link?.slackUserId ?? null;
}

/** URL firmada al endpoint de vinculación manual (exige sesión OPAI activa). */
export function buildLinkUrl(workspaceId: string, slackUserId: string): string {
  const token = signCookie(
    JSON.stringify({ workspaceId, slackUserId, exp: Date.now() + LINK_TOKEN_TTL_MS }),
  );
  return `${getCanonicalSiteUrl()}/api/integrations/slack/link?token=${encodeURIComponent(token)}`;
}

/** Blocks efímeros que instruyen al usuario a vincular su cuenta OPAI. */
export function buildLinkPrompt(workspace: ActiveWorkspace, slackUserId: string): {
  text: string;
  blocks: unknown[];
} {
  const url = buildLinkUrl(workspace.id, slackUserId);
  const text =
    "Para usar OPAI Intelligence necesito vincular tu usuario de Slack con tu cuenta de OPAI.";
  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `👋 *Vincula tu cuenta de OPAI*\nPara consultar datos y ejecutar acciones respetando tus permisos, vincula tu usuario. El enlace exige tu sesión activa de OPAI y vence en 15 minutos.`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Vincular mi cuenta OPAI", emoji: true },
            url,
            style: "primary",
          },
        ],
      },
    ],
  };
}
