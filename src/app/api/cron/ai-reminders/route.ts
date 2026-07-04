/**
 * Cron: entrega recordatorios del agente (CrmTask type reminder) por DM de Slack.
 * Cada 15 min busca tareas vencidas (status open) y notifica al assignedTo vinculado.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "@/lib/integrations/slack/workspace";
import { slackOpenDm, slackPostMessage } from "@/lib/integrations/slack/api";
import { getSlackUserIdForAdmin } from "@/lib/integrations/slack/user-link";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let delivered = 0;
  let noSlack = 0;

  try {
    const tasks = await prisma.crmTask.findMany({
      where: { type: "reminder", status: "open", dueAt: { lte: now } },
      take: 50,
      orderBy: { dueAt: "asc" },
      select: { id: true, tenantId: true, title: true, assignedTo: true },
    });

    for (const task of tasks) {
      try {
        if (!task.assignedTo) {
          await prisma.crmTask.update({ where: { id: task.id }, data: { status: "notified_no_slack" } });
          noSlack++;
          continue;
        }

        const ws = await getWorkspaceForTenant(task.tenantId);
        if (!ws) {
          await prisma.crmTask.update({ where: { id: task.id }, data: { status: "notified_no_slack" } });
          noSlack++;
          continue;
        }

        const slackUserId = await getSlackUserIdForAdmin(ws, task.assignedTo);
        if (!slackUserId) {
          await prisma.crmTask.update({ where: { id: task.id }, data: { status: "notified_no_slack" } });
          noSlack++;
          continue;
        }

        const dm = await slackOpenDm(ws.botToken, slackUserId);
        if (!dm) {
          await prisma.crmTask.update({ where: { id: task.id }, data: { status: "notified_no_slack" } });
          noSlack++;
          continue;
        }

        const text = `⏰ Recordatorio: *${task.title}*`;
        const blocks = [
          { type: "section", text: { type: "mrkdwn", text } },
          {
            type: "actions",
            elements: [{
              type: "button",
              action_id: "reminder_done",
              value: task.id,
              text: { type: "plain_text", text: "✅ Listo", emoji: true },
            }],
          },
        ];

        await slackPostMessage(ws.botToken, { channel: dm, text, blocks });
        await prisma.crmTask.update({ where: { id: task.id }, data: { status: "notified" } });
        delivered++;
      } catch (e) {
        console.error(`[ai-reminders] task ${task.id} failed:`, e);
      }
    }

    return NextResponse.json({
      success: true,
      data: { total: tasks.length, delivered, noSlack, timestamp: now.toISOString() },
    });
  } catch (error) {
    console.error("[CRON] ai-reminders error:", error);
    return NextResponse.json({ success: false, error: "ai-reminders failed" }, { status: 500 });
  }
}
