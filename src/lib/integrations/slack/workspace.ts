/**
 * Resolución de workspace/tenant para Slack.
 *
 * La frontera de aislamiento multi-tenant es `slack_team_id → tenantId`.
 * Nunca se confía en IDs del payload para saltarse esta resolución.
 */

import { prisma } from "@/lib/prisma";
import { decryptSlackToken } from "./crypto";

export interface ActiveWorkspace {
  id: string;
  tenantId: string;
  slackTeamId: string;
  teamName: string;
  botUserId: string;
  /** Token del bot ya descifrado (sólo en memoria, nunca persistir). */
  botToken: string;
  defaultChannelId: string | null;
  defaultChannelName: string | null;
}

/** Devuelve el workspace ACTIVE del tenant con el token descifrado, o null. */
export async function getWorkspaceForTenant(tenantId: string): Promise<ActiveWorkspace | null> {
  const ws = await prisma.slackWorkspace.findUnique({ where: { tenantId } });
  if (!ws || ws.status !== "ACTIVE") return null;
  let botToken: string;
  try {
    botToken = decryptSlackToken(ws.botTokenEnc);
  } catch (err) {
    console.error("[slack] no se pudo descifrar el token del workspace", ws.id, err);
    return null;
  }
  return {
    id: ws.id,
    tenantId: ws.tenantId,
    slackTeamId: ws.slackTeamId,
    teamName: ws.teamName,
    botUserId: ws.botUserId,
    botToken,
    defaultChannelId: ws.defaultChannelId,
    defaultChannelName: ws.defaultChannelName,
  };
}

/** Resuelve el tenant a partir del team_id de Slack (frontera de aislamiento). */
export async function getTenantForTeam(slackTeamId: string): Promise<{ tenantId: string; workspaceId: string } | null> {
  const ws = await prisma.slackWorkspace.findUnique({
    where: { slackTeamId },
    select: { tenantId: true, id: true },
  });
  return ws ? { tenantId: ws.tenantId, workspaceId: ws.id } : null;
}

/** Marca el workspace como REVOKED (app desinstalada / token revocado). */
export async function markWorkspaceRevoked(slackTeamId: string): Promise<void> {
  await prisma.slackWorkspace.updateMany({
    where: { slackTeamId },
    data: { status: "REVOKED" },
  });
}
