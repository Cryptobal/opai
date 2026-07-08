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

/** Resultado de renderizar el canvas: canvasId + si se creó o re-renderizó. */
export type StartCanvasResult = { canvasId: string; action: "created" | "rerendered" };

/**
 * Núcleo reutilizable: crea (si no existe) o re-renderiza el canvas de inicio del
 * negocio en su canal abierto. Devuelve el resultado o null si no hay sala/datos
 * o falla algo. Best-effort: nunca lanza.
 *
 * `ignoreFlag` salta la verificación de `startCanvasOnWon` (para backfills
 * puntuales que deben operar aunque el flag global del tenant esté OFF, sin
 * tocar la config). El dispatch normal del cierre pasa `ignoreFlag: false`.
 */
export async function renderStartCanvasForDeal(
  tenantId: string,
  dealId: string,
  opts: { ignoreFlag?: boolean } = {},
): Promise<StartCanvasResult | null> {
  try {
    if (!opts.ignoreFlag) {
      const cfg = await getDealRoomConfig(tenantId);
      if (!cfg.startCanvasOnWon) return null;
    }

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

    return { canvasId, action: existing ? "rerendered" : "created" };
  } catch (e) {
    const code = e instanceof SlackApiError ? e.slackError : e;
    console.error("[slack] renderStartCanvasForDeal falló:", code);
    return null;
  }
}

/**
 * Crea (si no existe) o re-renderiza el canvas de inicio del negocio. Devuelve el
 * canvasId, o null si el flag está apagado / no hay sala / falla algo.
 */
export async function ensureStartCanvas(tenantId: string, dealId: string): Promise<{ canvasId: string } | null> {
  const res = await renderStartCanvasForDeal(tenantId, dealId, { ignoreFlag: false });
  return res ? { canvasId: res.canvasId } : null;
}
