import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifySlackSignature } from "@/lib/integrations/slack/signature";
import { handleSlashCommand } from "@/lib/integrations/slack/commands";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/slack/commands — slash command `/opai`.
 * Pública en el proxy; seguridad por firma HMAC sobre el raw body (ANTES de
 * parsear). ACK inmediato ephemeral; la respuesta final llega vía response_url.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifySlackSignature({ headers: req.headers, rawBody })) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const teamId = form.get("team_id") ?? "";
  const slackUserId = form.get("user_id") ?? "";
  const channelId = form.get("channel_id") ?? "";
  const text = form.get("text") ?? "";
  const responseUrl = form.get("response_url") ?? "";
  const triggerId = form.get("trigger_id") ?? ""; // para abrir modales (ticket/rendición)

  if (responseUrl && teamId && slackUserId) {
    after(async () => {
      try {
        await handleSlashCommand({ teamId, slackUserId, channelId, text, responseUrl, triggerId });
      } catch (err) {
        console.error("[slack] handleSlashCommand falló:", err);
      }
    });
  }

  // ACK <3s: acuse ephemeral mientras se procesa en after().
  return NextResponse.json({ response_type: "ephemeral", text: "⏳ Procesando tu consulta…" });
}
