/**
 * Block actions de la Deal Room (Fase 16, prefijo `dealroom_`).
 *
 * Ficha viva: `dealroom_advance` / `dealroom_note` abren los MISMOS modales del
 * pipeline (callback_ids `pipe_advance` / `pipe_note`), así el submit existente
 * escribe el cambio y la ficha se refresca vía B2. Cierre (B5):
 * `dealroom_archive` archiva la sala y `dealroom_handoff` la convierte en canal
 * de operación; ambos editan la tarjeta de cierre. Los botones URL (`dealroom_wa`,
 * `dealroom_open`) los abre Slack directo (sin dispatch).
 */

import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { canEdit } from "@/lib/permissions";
import { slackOpenView, slackUpdateMessage, slackRespondUrl } from "../api";
import { advanceView, noteView } from "../comercial/pipeline";
import { assistantSection } from "../blocks";

interface Payload {
  team?: { id?: string };
  user?: { id?: string };
  trigger_id?: string;
  response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
  container?: { channel_id?: string; message_ts?: string; is_ephemeral?: boolean };
}

export async function handleDealRoomAction(payload: Payload): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  const actionId = action?.action_id;
  const dealId = action?.value;
  // Los botones URL (wa / open) no llevan value ni requieren trabajo.
  if (!teamId || !slackUserId || !actionId || !dealId) return;
  const isModalBtn = actionId === "dealroom_advance" || actionId === "dealroom_note";
  const isCloseBtn = actionId === "dealroom_archive" || actionId === "dealroom_handoff";
  if (!isModalBtn && !isCloseBtn) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;
  if (!canEdit(linked.perms, "crm", "deals")) return;
  const tenantId = workspace.tenantId;

  // Ficha viva: abrir modal Avanzar / Nota.
  if (isModalBtn) {
    if (!payload.trigger_id) return;
    const view = actionId === "dealroom_advance" ? await advanceView(tenantId, dealId) : noteView(dealId);
    await slackOpenView(workspace.botToken, payload.trigger_id, view).catch((e) =>
      console.error("[slack] dealroom action abrir modal falló:", e),
    );
    return;
  }

  const { archiveDealRoom, handoffDealRoomToOps } = await import("./lifecycle");
  const channel = payload.container?.channel_id;
  const ts = payload.container?.message_ts;
  const editCard = async (text: string) => {
    if (channel && ts) {
      await slackUpdateMessage(workspace.botToken, { channel, ts, text, blocks: [assistantSection(text)] }).catch(async () => {
        if (payload.response_url) await slackRespondUrl(payload.response_url, { text, replace_original: true }).catch(() => {});
      });
    } else if (payload.response_url) {
      await slackRespondUrl(payload.response_url, { text, replace_original: true }).catch(() => {});
    }
  };

  if (actionId === "dealroom_archive") {
    // Un canal archivado ya no admite chat.update: editamos la tarjeta a su
    // estado final ANTES de archivar. Si el archivo falla, avisamos aparte.
    await editCard("🗄 Sala archivada. El historial queda guardado en OPAI.");
    const r = await archiveDealRoom(tenantId, dealId, linked.adminId);
    if (!r.ok && payload.response_url) {
      await slackRespondUrl(payload.response_url, { text: `⚠️ ${r.message}`, response_type: "ephemeral" }).catch(() => {});
    }
    return;
  }

  // Handoff: el canal sigue abierto → editar la tarjeta con el resultado real.
  const r = await handoffDealRoomToOps(tenantId, dealId, linked.adminId);
  await editCard(r.message);
}
