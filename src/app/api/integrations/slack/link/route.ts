import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { verifyCookie } from "@/lib/cookie-signature";
import { logAudit } from "@/lib/audit";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";

export const dynamic = "force-dynamic";

const SETTINGS_PATH = "/opai/configuracion/integraciones/slack";

function redirect(query: string): NextResponse {
  return NextResponse.redirect(new URL(`${SETTINGS_PATH}${query}`, getCanonicalSiteUrl()));
}

/**
 * GET /api/integrations/slack/link?token=<firmado>
 *
 * Vinculación MANUAL de un usuario Slack a su Admin de OPAI. Exige sesión
 * activa (requireAuth) — NO es pública en el proxy, a diferencia de
 * events/interactivity/commands (que autentican por firma HMAC). El token
 * firmado transporta {workspaceId, slackUserId, exp}; el vínculo se crea con
 * el Admin de la sesión, validando que su tenant coincide con el del workspace.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) {
    // Sin sesión: manda a login y de vuelta al link tras autenticarse.
    const back = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(new URL(`/opai/login?callbackUrl=${back}`, getCanonicalSiteUrl()));
  }

  const token = req.nextUrl.searchParams.get("token") ?? "";
  const raw = verifyCookie(token);
  if (!raw) return redirect("?link_error=invalid");

  let payload: { workspaceId?: string; slackUserId?: string; exp?: number };
  try {
    payload = JSON.parse(raw);
  } catch {
    return redirect("?link_error=invalid");
  }
  if (!payload.workspaceId || !payload.slackUserId) return redirect("?link_error=invalid");
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) return redirect("?link_error=expired");

  const workspace = await prisma.slackWorkspace.findUnique({
    where: { id: payload.workspaceId },
    select: { id: true, tenantId: true, status: true },
  });
  if (!workspace || workspace.status !== "ACTIVE") return redirect("?link_error=workspace");

  // Frontera de aislamiento: la sesión debe pertenecer al tenant del workspace.
  if (workspace.tenantId !== ctx.tenantId) return redirect("?link_error=tenant");

  await prisma.slackUserLink.upsert({
    where: {
      workspaceId_slackUserId: {
        workspaceId: workspace.id,
        slackUserId: payload.slackUserId,
      },
    },
    create: {
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      slackUserId: payload.slackUserId,
      adminId: ctx.userId,
      slackEmail: ctx.userEmail || null,
    },
    update: { adminId: ctx.userId, slackEmail: ctx.userEmail || null },
  });

  await logAudit({
    action: "CREATE",
    entity: "SlackUserLink",
    entityId: ctx.userId,
    tenantId: workspace.tenantId,
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    details: { slackUserId: payload.slackUserId, via: "manual_signed" },
  });

  return redirect("?linked=1");
}
