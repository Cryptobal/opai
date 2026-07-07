/**
 * Persistencia del canvas_id de la Ficha de Inicio por negocio (Canvas de Slack).
 *
 * Reutiliza la fila `CrmDealSlackRoom` que ya vincula deal↔canal (columna
 * aditiva `start_canvas_id`). Idempotencia del canvas: si ya hay id guardado, el
 * orquestador re-renderiza en vez de crear otro. Multi-tenant: toda query filtra
 * por `tenantId`.
 */

import { prisma } from "@/lib/prisma";

/** canvas_id de la Ficha de Inicio del negocio, o null si aún no se creó. */
export async function getDealStartCanvasId(tenantId: string, dealId: string): Promise<string | null> {
  const room = await prisma.crmDealSlackRoom
    .findFirst({ where: { tenantId, dealId }, select: { startCanvasId: true } })
    .catch(() => null);
  return room?.startCanvasId ?? null;
}

/** Guarda el canvas_id recién creado en la sala del negocio (best-effort por dealId). */
export async function setDealStartCanvasId(tenantId: string, dealId: string, canvasId: string): Promise<void> {
  await prisma.crmDealSlackRoom.updateMany({ where: { tenantId, dealId }, data: { startCanvasId: canvasId } });
}
