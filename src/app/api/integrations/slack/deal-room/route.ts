/**
 * POST /api/integrations/slack/deal-room (Fase 16, B1)
 * Abre (o devuelve) la sala de Slack de un negocio. Botón manual desde el
 * detalle del negocio en la web. Requiere módulo CRM + permiso de edición de
 * negocios (mismo gate que avanzar etapa). Identidad real del usuario.
 */

import { NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { openDealRoom } from "@/lib/integrations/slack/deal-rooms/room";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const auth = await requireTenantModule("crm");
  if (!auth.authorized) return auth.response;
  const editErr = await requireCrmEdit(auth.ctx, "deals");
  if (editErr) return editErr;

  let dealId = "";
  try {
    const body = (await req.json()) as { dealId?: string };
    dealId = body.dealId ?? "";
  } catch {
    /* body inválido → 400 abajo */
  }
  if (!dealId) return NextResponse.json({ success: false, error: "Falta dealId." }, { status: 400 });

  const r = await openDealRoom(auth.ctx.tenantId, dealId, auth.ctx.userId);
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 502 });
  // Deep link que abre el canal en la app de Slack (native/web). Requiere teamId.
  const deepLink =
    r.teamId && r.channelId
      ? `https://slack.com/app_redirect?channel=${r.channelId}&team=${r.teamId}`
      : null;
  return NextResponse.json({
    success: true,
    channelId: r.channelId,
    channelName: r.channelName,
    teamId: r.teamId,
    deepLink,
    alreadyExisted: !!r.alreadyExisted,
    message: r.alreadyExisted ? `La sala #${r.channelName} ya existía.` : `Sala #${r.channelName} abierta en Slack.`,
  });
}
