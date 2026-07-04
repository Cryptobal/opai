/**
 * Handler block_actions `reminder_done`: cierra un recordatorio desde el DM de Slack.
 */

import { prisma } from "@/lib/prisma";
import { getTenantForTeam, getWorkspaceForTenant } from "./workspace";
import { resolveLinkedAdmin } from "./user-link";
import { slackUpdateMessage } from "./api";
import { assistantSection } from "./blocks";

interface BlockActionsPayload {
  team?: { id?: string };
  user?: { id?: string };
  container?: { channel_id?: string; message_ts?: string };
}

export async function handleReminderDoneAction(payload: BlockActionsPayload): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const taskId = (payload as { actions?: Array<{ value?: string }> }).actions?.[0]?.value;
  const channel = payload.container?.channel_id;
  const ts = payload.container?.message_ts;
  if (!teamId || !slackUserId || !taskId || !channel || !ts) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;

  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;

  const task = await prisma.crmTask.findFirst({
    where: { id: taskId, tenantId: workspace.tenantId, type: "reminder" },
    select: { id: true, title: true, assignedTo: true, status: true },
  });
  if (!task || task.assignedTo !== linked.adminId) return;

  if (task.status !== "done") {
    await prisma.crmTask.update({ where: { id: task.id }, data: { status: "done" } });
  }

  const text = `✅ Listo — ${task.title}`;
  await slackUpdateMessage(workspace.botToken, {
    channel,
    ts,
    text,
    blocks: [assistantSection(text)],
  }).catch(() => {});
}
