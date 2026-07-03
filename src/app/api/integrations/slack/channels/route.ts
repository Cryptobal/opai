import { NextResponse } from "next/server";
import { requireSlackAdmin } from "@/lib/integrations/slack/guard";
import { getWorkspaceForTenant } from "@/lib/integrations/slack/workspace";
import { slackListChannels, SlackApiError, type SlackChannel } from "@/lib/integrations/slack/api";

export const dynamic = "force-dynamic";

// Caché en memoria por workspace (5 min) para no golpear rate limits de Slack.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { channels: SlackChannel[]; expiresAt: number }>();

/** GET → lista de canales del workspace del tenant (con caché). */
export async function GET() {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;

  const ws = await getWorkspaceForTenant(auth.ctx.tenantId);
  if (!ws) {
    return NextResponse.json({ success: false, error: "Slack no está conectado" }, { status: 400 });
  }

  const hit = cache.get(ws.id);
  if (hit && hit.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, channels: hit.channels });
  }

  try {
    const channels = await slackListChannels(ws.botToken);
    cache.set(ws.id, { channels, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ success: true, channels });
  } catch (err) {
    const reason = err instanceof SlackApiError ? err.slackError : "unknown_error";
    console.error("[slack] error listando canales:", reason);
    return NextResponse.json({ success: false, error: reason }, { status: 502 });
  }
}
