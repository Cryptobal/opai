/**
 * Orquestación de la Ficha de Inicio (Canvas de Slack al adjudicar un negocio).
 *
 * `ensureStartCanvas` crea el canvas del canal la primera vez (guardando su
 * canvas_id) o lo re-renderiza si ya existe. Todo detrás del flag
 * `startCanvasOnWon` (default OFF) y best-effort: cualquier error se loguea y no
 * se propaga (nunca rompe el dispatch del cierre).
 */

import "server-only";
import { logAudit } from "@/lib/audit";
import { getWorkspaceForTenant } from "../workspace";
import { SlackApiError } from "../api";
import { slackChannelCanvasCreate, slackCanvasReplaceAll } from "../canvas";
import { getDealRoomConfig } from "./config";
import { getOpenDealRoom } from "./room";
import { loadStartCanvasData } from "./start-canvas-data";
import { renderStartCanvasMarkdown } from "./start-canvas-render";
import { getDealStartCanvasId, setDealStartCanvasId } from "./canvas-store";

/** Deep-link que abre el canal (donde el canvas vive como pestaña) en la app nativa. */
export function startCanvasChannelUrl(teamId: string, channelId: string): string {
  return `https://slack.com/app_redirect?channel=${channelId}&team=${teamId}`;
}

/**
 * Crea (si no existe) o re-renderiza el canvas de inicio del negocio. Devuelve el
 * canvasId, o null si el flag está apagado / no hay sala / falla algo.
 */
export async function ensureStartCanvas(tenantId: string, dealId: string): Promise<{ canvasId: string } | null> {
  try {
    const cfg = await getDealRoomConfig(tenantId);
    if (!cfg.startCanvasOnWon) return null;

    const [ws, room] = await Promise.all([getWorkspaceForTenant(tenantId), getOpenDealRoom(tenantId, dealId)]);
    if (!ws || !room) return null;

    const data = await loadStartCanvasData(tenantId, dealId);
    if (!data) return null;
    const markdown = renderStartCanvasMarkdown(data);

    const existing = await getDealStartCanvasId(tenantId, dealId);
    let canvasId = existing;
    if (existing) {
      await slackCanvasReplaceAll(ws.botToken, { canvasId: existing, markdown });
    } else {
      const created = await slackChannelCanvasCreate(ws.botToken, { channelId: room.slackChannelId, markdown });
      canvasId = created.canvasId;
      if (canvasId) await setDealStartCanvasId(tenantId, dealId, canvasId);
    }
    if (!canvasId) return null;

    await logAudit({
      action: existing ? "UPDATE" : "CREATE",
      entity: "DealStartCanvas",
      entityId: dealId,
      tenantId,
      userId: "system",
      details: { canvasId, channelId: room.slackChannelId, via: "slack" },
    }).catch(() => {});

    return { canvasId };
  } catch (e) {
    const code = e instanceof SlackApiError ? e.slackError : e;
    console.error("[slack] ensureStartCanvas falló:", code);
    return null;
  }
}
