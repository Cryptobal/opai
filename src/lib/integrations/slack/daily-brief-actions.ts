/**
 * Handler block_actions `brief_toggle`: opt-in/out del brief matinal desde App Home.
 */

import { getTenantForTeam, getWorkspaceForTenant } from "./workspace";
import { resolveLinkedAdmin } from "./user-link";
import { toggleDailyBriefOptIn } from "./daily-brief";
import { publishHome } from "./home";
import { slackRespondUrl } from "./api";

interface BlockActionsPayload {
  team?: { id?: string };
  user?: { id?: string };
  response_url?: string;
}

export async function handleBriefToggleAction(payload: BlockActionsPayload): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  if (!teamId || !slackUserId) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;

  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;

  const enabled = await toggleDailyBriefOptIn(workspace.tenantId, linked.adminId);
  await publishHome(workspace.tenantId, slackUserId);

  if (payload.response_url) {
    await slackRespondUrl(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: enabled
        ? "🌅 Brief diario activado. Recibirás un DM entre semana ~08:00 (Chile)."
        : "Brief diario desactivado.",
    }).catch(() => {});
  }
}
