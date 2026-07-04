/**
 * Block actions de la ficha viva de una Deal Room (Fase 16, prefijo `dealroom_`).
 *
 * `dealroom_advance` / `dealroom_note` abren los MISMOS modales del pipeline
 * (callback_ids `pipe_advance` / `pipe_note`), así el submit ya existente escribe
 * el cambio y la ficha se refresca vía B2. Los botones URL (`dealroom_wa`,
 * `dealroom_open`) no requieren dispatch — Slack los abre directo.
 */

import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { canEdit } from "@/lib/permissions";
import { slackOpenView } from "../api";
import { advanceView, noteView } from "../comercial/pipeline";

interface Payload {
  team?: { id?: string };
  user?: { id?: string };
  trigger_id?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
}

export async function handleDealRoomAction(payload: Payload): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  const actionId = action?.action_id;
  const dealId = action?.value;
  // Los botones URL (wa / open) no llevan value ni requieren trabajo.
  if (!teamId || !slackUserId || !actionId || !dealId || !payload.trigger_id) return;
  if (actionId !== "dealroom_advance" && actionId !== "dealroom_note") return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;
  if (!canEdit(linked.perms, "crm", "deals")) return;

  const view =
    actionId === "dealroom_advance"
      ? await advanceView(workspace.tenantId, dealId)
      : noteView(dealId);
  await slackOpenView(workspace.botToken, payload.trigger_id, view).catch((e) =>
    console.error("[slack] dealroom action abrir modal falló:", e),
  );
}
