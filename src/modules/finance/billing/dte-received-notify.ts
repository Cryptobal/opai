/**
 * Emisor de la card Slack "DTE recibido" al ingerir DTEs de proveedores nuevos.
 *
 * Best-effort: NUNCA rompe el sync/ingesta (el sync es crítico; la notificación
 * es secundaria). Idempotente por construcción: el caller solo pasa inserciones
 * NUEVAS, así que un re-sync sin novedades no llega acá (array vacío → skip).
 *
 * El ruteo al canal lo resuelve `notify` vía catálogo + `SlackChannelRoute`
 * (canal elegido por el admin para el evento `dte_received`).
 */

import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import {
  buildDteReceivedBlocks,
  buildDteReceivedText,
  type DteReceivedForBlocks,
} from "@/lib/integrations/slack/dte-received-blocks";

/** Datos mínimos de un DTE recibido recién creado (sin centro de costo aún). */
export interface NewReceivedDteForNotify {
  id: string;
  dteType: number;
  folio: number;
  issuerName: string;
  issuerRut: string;
  date: Date;
  totalAmount: number;
  netAmount: number;
  taxAmount: number;
}

function toBlocksRow(d: NewReceivedDteForNotify): DteReceivedForBlocks {
  return {
    dteId: d.id,
    dteType: d.dteType,
    folio: d.folio,
    issuerName: d.issuerName,
    issuerRut: d.issuerRut,
    date: d.date.toISOString().slice(0, 10),
    totalAmount: d.totalAmount,
    netAmount: d.netAmount,
    taxAmount: d.taxAmount,
    receptionStatus: "PENDING_REVIEW",
    costCenterLabel: null, // recién creados → nunca tienen centro de costo
  };
}

/** Emite UNA card con los DTEs recibidos nuevos. No lanza. */
export async function notifyNewReceivedDtes(
  tenantId: string,
  dtes: NewReceivedDteForNotify[],
): Promise<void> {
  if (dtes.length === 0) return;
  try {
    const rows = dtes.map(toBlocksRow);
    const summary =
      dtes.length === 1
        ? "Llegó 1 documento tributario de un proveedor — pendiente de acuse SII."
        : `Llegaron ${dtes.length} documentos tributarios de proveedores — pendientes de acuse SII.`;
    const blocks = buildDteReceivedBlocks(rows, summary);
    const text = buildDteReceivedText(rows);
    await notify({
      tenantId,
      type: "dte_received",
      title: `${dtes.length} DTE recibido(s) de proveedores`,
      body: text,
      data: { __customBlocks: blocks, __customText: text },
      link: "/finanzas/facturacion/recibidos",
    });
  } catch (err) {
    console.error("[dte-received] notify Slack falló (best-effort):", err);
  }
}

/**
 * Variante para callers que solo tienen los ids recién creados (ingesta por
 * email): carga los campos necesarios (revalidando `tenantId` + RECEIVED) y
 * delega en `notifyNewReceivedDtes`.
 */
export async function notifyNewReceivedDteIds(
  tenantId: string,
  dteIds: string[],
): Promise<void> {
  if (dteIds.length === 0) return;
  try {
    const rows = await prisma.financeDte.findMany({
      where: { id: { in: dteIds }, tenantId, direction: "RECEIVED" },
      select: {
        id: true,
        dteType: true,
        folio: true,
        issuerName: true,
        issuerRut: true,
        date: true,
        totalAmount: true,
        netAmount: true,
        taxAmount: true,
      },
    });
    await notifyNewReceivedDtes(
      tenantId,
      rows.map((r) => ({
        id: r.id,
        dteType: r.dteType,
        folio: r.folio,
        issuerName: r.issuerName,
        issuerRut: r.issuerRut,
        date: r.date,
        totalAmount: r.totalAmount.toNumber(),
        netAmount: r.netAmount.toNumber(),
        taxAmount: r.taxAmount.toNumber(),
      })),
    );
  } catch (err) {
    console.error("[dte-received] notify Slack (por ids) falló (best-effort):", err);
  }
}
