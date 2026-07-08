/**
 * Servicio del mensaje-ficha del tablero de relevo (auto-editable), espejo de
 * `CrmDealSlackRoom.fichaTs`: un único mensaje por (instalación, día, turno
 * entrante) que se re-edita con `chat.update` en cada cambio de asistencia.
 *
 * NOTA de construcción incremental: `refreshRelevoBoardForInstallation` se
 * scaffoldea en el Bloque 4 (los endpoints de marca la invocan best-effort). Su
 * cuerpo completo (re-armar blocks + `slackUpdateMessage`) y las funciones
 * `publishRelevoBoard` / `closeRelevoBoard` llegan en el Bloque 6.
 */

import { prisma } from "@/lib/prisma";

/**
 * Re-arma y re-edita el/los tablero(s) OPEN de una instalación/fecha tras un
 * cambio de asistencia. Best-effort, NUNCA lanza. No-op si no hay tablero OPEN.
 */
export async function refreshRelevoBoardForInstallation(
  tenantId: string,
  installationId: string,
  date: Date,
): Promise<void> {
  try {
    const boards = await prisma.opsRelevoSlackBoard.findMany({
      where: { tenantId, installationId, date, status: "OPEN" },
      select: { id: true },
    });
    if (boards.length === 0) return; // sin tablero activo → no-op idempotente
    // TODO(Bloque 6): re-armar blocks con buildRelevoBoardData/buildRelevoBlocks
    // y aplicar slackUpdateMessage sobre cada board.slackTs.
  } catch (err) {
    console.error("[relevo-board] refresh falló:", err);
  }
}
