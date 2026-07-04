/**
 * POST /api/integrations/slack/join-all (Fase 15, B8)
 * OPAI se une a TODOS los canales públicos del workspace. Los privados requieren
 * invitación manual (regla de Slack). Solo admins de Slack del tenant.
 */

import { NextResponse } from "next/server";
import { requireSlackAdmin } from "@/lib/integrations/slack/guard";
import { joinAllPublicChannels } from "@/lib/integrations/slack/presence";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;

  try {
    const r = await joinAllPublicChannels(auth.ctx.tenantId);
    if (r.total === 0) return NextResponse.json({ success: false, error: "Slack no está conectado o no hay canales públicos." }, { status: 400 });
    return NextResponse.json({
      success: true,
      ...r,
      message: `Unido a ${r.joined} canal(es); ya estaba en ${r.already}.${r.failed ? ` ${r.failed} no se pudieron unir.` : ""} Los privados requieren /invite @OPAI.`,
    });
  } catch (err) {
    console.error("[slack] join-all falló:", err);
    return NextResponse.json({ success: false, error: "No se pudo completar la unión masiva." }, { status: 502 });
  }
}
