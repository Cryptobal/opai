/**
 * Efecto secundario de registrar una interacción sobre un negocio (Fase 4).
 * Espeja la interacción en la sala (si existe) y refresca la ficha viva. En
 * Fase 4.4 se suma un insight proactivo con la próxima mejor acción.
 * Todo best-effort: no rompe el registro de la nota.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { interactionLabel } from "@/lib/crm/interaction-types";
import { getOpenDealRoom, mirrorDealNoteToRoom, refreshDealRoomFicha } from "./room";

export async function onDealInteractionLogged(
  tenantId: string,
  dealId: string,
  adminId: string,
  interactionType: string,
  summary: string,
): Promise<void> {
  const room = await getOpenDealRoom(tenantId, dealId);
  if (!room) return; // sin sala OPEN: no hay dónde espejar ni sobre qué dar insight
  const admin = await prisma.admin.findFirst({ where: { id: adminId, tenantId }, select: { name: true } }).catch(() => null);
  const authorName = admin?.name ?? "Alguien";
  await mirrorDealNoteToRoom(tenantId, dealId, `${interactionLabel(interactionType)}: ${summary}`, authorName).catch(() => {});
  await refreshDealRoomFicha(tenantId, dealId).catch(() => {});
}
