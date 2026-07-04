/**
 * GET/POST /api/integrations/slack/governance (Fase 16, B6)
 * Lista de canales EXCLUIDOS de lectura del bot (B8 + Channel Expert). Solo
 * admins de Slack del tenant. La exclusión es opt-in y se guarda en Setting.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSlackAdmin } from "@/lib/integrations/slack/guard";
import { getExcludedChannelIds, setExcludedChannelIds } from "@/lib/integrations/slack/channel-exclusions";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;
  const ids = await getExcludedChannelIds(auth.ctx.tenantId);
  return NextResponse.json({ success: true, excludedChannelIds: [...ids] });
}

export async function POST(req: NextRequest) {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;

  let channelIds: string[] = [];
  try {
    const body = (await req.json()) as { channelIds?: unknown };
    if (Array.isArray(body.channelIds)) channelIds = body.channelIds.filter((x): x is string => typeof x === "string");
  } catch {
    return NextResponse.json({ success: false, error: "Body inválido." }, { status: 400 });
  }

  const saved = await setExcludedChannelIds(auth.ctx.tenantId, channelIds);
  await logAudit({
    action: "UPDATE", entity: "SlackGovernance", entityId: auth.ctx.tenantId,
    tenantId: auth.ctx.tenantId, userId: auth.ctx.userId, details: { excludedChannelIds: saved, via: "web" },
  });
  return NextResponse.json({ success: true, excludedChannelIds: saved });
}
