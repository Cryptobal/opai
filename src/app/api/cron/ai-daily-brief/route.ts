/**
 * Cron: brief matinal del agente por DM (L-V ~08:00 Chile).
 * Solo usuarios con opt-in en Setting `ai_daily_brief:{tenantId}`.
 */

import { NextRequest, NextResponse } from "next/server";
import { hasCapability } from "@/lib/permissions";
import { resolvePermissionsById } from "@/lib/permissions-server";
import { runHelpChatTurn } from "@/lib/ai/help-chat-runner";
import { getWorkspaceForTenant } from "@/lib/integrations/slack/workspace";
import { getSlackUserIdForAdmin } from "@/lib/integrations/slack/user-link";
import { slackOpenDm, slackPostMessage } from "@/lib/integrations/slack/api";
import { assistantSection } from "@/lib/integrations/slack/blocks";
import { toSlackMarkdown } from "@/lib/integrations/slack/markdown";
import { BRIEF_PROMPT, listTenantsWithDailyBriefOptIns } from "@/lib/integrations/slack/daily-brief";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sent = 0;
  let failed = 0;

  try {
    const tenants = await listTenantsWithDailyBriefOptIns();

    for (const { tenantId, adminIds } of tenants) {
      const ws = await getWorkspaceForTenant(tenantId);
      if (!ws) continue;

      for (const adminId of adminIds.slice(0, 20)) {
        try {
          const slackUserId = await getSlackUserIdForAdmin(ws, adminId);
          if (!slackUserId) continue;

          const perms = await resolvePermissionsById(adminId);
          const result = await runHelpChatTurn({
            tenantId,
            userId: adminId,
            perms,
            canViewAllRendiciones: hasCapability(perms, "rendicion_view_all"),
            history: [],
            userMessage: BRIEF_PROMPT,
            allowWrites: false,
          });

          const dm = await slackOpenDm(ws.botToken, slackUserId);
          if (!dm) {
            failed++;
            continue;
          }

          const blocks: unknown[] = [
            { type: "header", text: { type: "plain_text", text: "🌅 Tu día", emoji: true } },
            assistantSection(toSlackMarkdown(result.text)),
          ];
          if (result.entities?.length) {
            blocks.push({ type: "divider" });
            for (const e of result.entities) {
              blocks.push({
                type: "section",
                text: { type: "mrkdwn", text: `*${e.title}*${e.subtitle ? `\n${e.subtitle}` : ""}` },
                accessory: {
                  type: "button",
                  text: { type: "plain_text", text: "Abrir en OPAI", emoji: true },
                  url: e.url,
                },
              });
            }
          }

          await slackPostMessage(ws.botToken, {
            channel: dm,
            text: `🌅 Tu día\n${result.text.slice(0, 2800)}`,
            blocks,
          });
          sent++;
        } catch (e) {
          failed++;
          console.error(`[ai-daily-brief] tenant=${tenantId} admin=${adminId}:`, e);
        }
      }
    }

    return NextResponse.json({ success: true, data: { tenants: tenants.length, sent, failed } });
  } catch (error) {
    console.error("[CRON] ai-daily-brief error:", error);
    return NextResponse.json({ success: false, error: "ai-daily-brief failed" }, { status: 500 });
  }
}
