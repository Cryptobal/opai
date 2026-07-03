import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCookie } from "@/lib/cookie-signature";
import { slackOAuthAccess } from "@/lib/integrations/slack/api";
import { encryptSlackToken } from "@/lib/integrations/slack/crypto";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "slack_oauth_state";

function panel(query: string): string {
  return `${getCanonicalSiteUrl()}/opai/configuracion/integraciones/slack?${query}`;
}

interface StatePayload {
  tenantId: string;
  adminId: string;
  nonce: string;
  exp: number;
}

/**
 * GET /api/integrations/slack/oauth/callback
 * Valida el state (firma + cookie + exp), intercambia el code por el token
 * del bot y hace upsert del SlackWorkspace del tenant. Pública en el proxy;
 * la seguridad la da el state firmado.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const denied = url.searchParams.get("error");
  if (denied) {
    console.error("[slack] OAuth denegado por el usuario:", denied);
    return NextResponse.redirect(panel("error=denied"));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get(STATE_COOKIE)?.value;

  const clearCookie = (res: NextResponse) => {
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  if (!code || !state || !cookieState || state !== cookieState) {
    console.error("[slack] OAuth callback con state inválido o ausente");
    return clearCookie(NextResponse.redirect(panel("error=state")));
  }

  const raw = verifyCookie(state);
  if (!raw) {
    console.error("[slack] OAuth state con firma inválida");
    return clearCookie(NextResponse.redirect(panel("error=state")));
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(raw) as StatePayload;
  } catch {
    return clearCookie(NextResponse.redirect(panel("error=state")));
  }
  if (!payload.tenantId || typeof payload.exp !== "number" || payload.exp < Date.now()) {
    console.error("[slack] OAuth state expirado");
    return clearCookie(NextResponse.redirect(panel("error=expired")));
  }

  let oauth;
  try {
    oauth = await slackOAuthAccess(code);
  } catch (err) {
    console.error("[slack] fallo en intercambio de code:", err);
    return clearCookie(NextResponse.redirect(panel("error=oauth")));
  }

  if (!oauth.teamId || !oauth.accessToken) {
    return clearCookie(NextResponse.redirect(panel("error=oauth")));
  }

  // Aislamiento: si este team ya pertenece a OTRO tenant, no sobreescribir.
  const existingByTeam = await prisma.slackWorkspace.findUnique({
    where: { slackTeamId: oauth.teamId },
    select: { tenantId: true },
  });
  if (existingByTeam && existingByTeam.tenantId !== payload.tenantId) {
    console.error("[slack] team ya vinculado a otro tenant:", oauth.teamId);
    return clearCookie(NextResponse.redirect(panel("error=workspace_taken")));
  }

  const botTokenEnc = encryptSlackToken(oauth.accessToken);
  await prisma.slackWorkspace.upsert({
    where: { tenantId: payload.tenantId },
    create: {
      tenantId: payload.tenantId,
      slackTeamId: oauth.teamId,
      teamName: oauth.teamName,
      botUserId: oauth.botUserId,
      botTokenEnc,
      scopes: oauth.scope,
      installedBy: payload.adminId,
      status: "ACTIVE",
    },
    update: {
      slackTeamId: oauth.teamId,
      teamName: oauth.teamName,
      botUserId: oauth.botUserId,
      botTokenEnc,
      scopes: oauth.scope,
      installedBy: payload.adminId,
      status: "ACTIVE",
    },
  });

  await logAudit({
    action: "CREATE",
    entity: "SlackWorkspace",
    entityId: oauth.teamId,
    tenantId: payload.tenantId,
    userId: payload.adminId,
    details: { teamName: oauth.teamName, scopes: oauth.scope },
    request: req,
  });

  return clearCookie(NextResponse.redirect(panel("connected=1")));
}
