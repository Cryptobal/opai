import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { signCookie } from "@/lib/cookie-signature";
import { slackAuthorizeUrl } from "@/lib/integrations/slack/config";

export const dynamic = "force-dynamic";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 min
const STATE_COOKIE = "slack_oauth_state";

/**
 * GET /api/integrations/slack/oauth/start
 * Inicia el flujo OAuth v2: firma un `state` con {tenantId, adminId, nonce, exp},
 * lo guarda en cookie httpOnly y redirige a la pantalla de autorización de Slack.
 */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  if (!["owner", "admin"].includes(ctx.userRole ?? "")) {
    return NextResponse.json(
      { success: false, error: "Solo administradores pueden conectar Slack" },
      { status: 403 },
    );
  }

  if (!process.env.SLACK_CLIENT_ID) {
    console.error("[slack] SLACK_CLIENT_ID no configurado");
    return NextResponse.redirect(
      new URL(
        "/opai/configuracion/integraciones/slack?error=config",
        process.env.PUBLIC_APP_URL ?? "https://www.opai.cl",
      ),
    );
  }

  const state = signCookie(
    JSON.stringify({
      tenantId: ctx.tenantId,
      adminId: ctx.userId,
      nonce: randomBytes(16).toString("hex"),
      exp: Date.now() + STATE_TTL_MS,
    }),
  );

  const res = NextResponse.redirect(slackAuthorizeUrl(state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_MS / 1000,
  });
  return res;
}
