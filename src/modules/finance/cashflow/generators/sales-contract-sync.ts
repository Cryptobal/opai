import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * NOTA — 2026-05-11
 *
 * El pipeline de auto-sync desde CpqQuote → FinanceCashflowItem fue eliminado.
 * Los contratos ahora se agregan manualmente al flujo de caja desde el tab
 * "Contratos" de cada cuenta CRM (botón verde / ContractCashflowDialog), con
 * monto editable en UF o CLP. Esto evita el bug histórico donde el monto del
 * quote se interpretaba como UF cuando realmente estaba almacenado en CLP
 * (caso Santa Hilda: "UF 2.682.070,75/mes").
 *
 * Las funciones de este archivo se mantienen como no-ops para no romper
 * callers existentes (portal cliente, cpq quotes, cron). Pueden eliminarse
 * cuando se hayan limpiado los callsites.
 */

type SyncAction = "created" | "updated" | "deactivated" | "reactivated" | "noop";

export async function syncContractItemForQuote(
  _tenantId: string,
  _quoteId: string,
): Promise<{ action: SyncAction }> {
  return { action: "noop" };
}

export interface BackfillContractStats {
  created: number;
  updated: number;
  reactivated: number;
  deactivated: number;
}

export async function backfillContractItems(
  _tenantId: string,
): Promise<BackfillContractStats> {
  return { created: 0, updated: 0, reactivated: 0, deactivated: 0 };
}

export async function setContractItemsActive(
  tenantId: string,
  active: boolean,
): Promise<{ affected: number }> {
  // Compat shim: el toggle ya no existe en config. Solo afecta a items
  // CONTRACT LEGACY — los que apuntan a un CpqQuote (modelo viejo). Los
  // items CONTRACT nuevos (apuntan a un Document desde el tab Contratos del
  // CRM) son fuente-de-verdad y NO se tocan acá.
  const legacy = await prisma.financeCashflowItem.findMany({
    where: { tenantId, source: "CONTRACT", sourceRefId: { not: null } },
    select: { id: true, sourceRefId: true },
  });
  const legacyIds: string[] = [];
  for (const item of legacy) {
    if (!item.sourceRefId) continue;
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: item.sourceRefId, tenantId },
      select: { id: true },
    });
    if (quote) legacyIds.push(item.id);
  }
  if (legacyIds.length === 0) return { affected: 0 };
  const result = await prisma.financeCashflowItem.updateMany({
    where: { id: { in: legacyIds } },
    data: { isActive: active },
  });
  return { affected: result.count };
}

/**
 * Migra todos los items source=CONTRACT del tenant a source=OTHER, dejándolos
 * editables manualmente desde ContractCashflowDialog. Idempotente.
 *
 * Reescritura de sourceRefId:
 *  - source=CONTRACT.sourceRefId apunta al CpqQuote.id (modelo viejo).
 *  - source=OTHER.sourceRefId debe apuntar al Document.id (el contrato PDF)
 *    para que el endpoint /api/crm/accounts/[id]/contracts/[contractId]/cashflow
 *    pueda encontrarlo desde el tab "Contratos" del CRM.
 *
 * Para cada item:
 *  1. Buscar el CpqQuote por id (sourceRefId actual).
 *  2. Si el quote tiene dealId, buscar Documents asociados a ese deal
 *     (DocAssociation entityType=crm_deal). Tomar el primero que sea contrato
 *     de servicio (module=crm, category=contrato_servicio).
 *  3. Si encontramos un document → sourceRefId = document.id.
 *  4. Si no → dejar sourceRefId apuntando al quote (huérfano: el item igual
 *     queda en el flujo de caja y editable, solo que no se asocia a un PDF
 *     del CRM).
 *
 * El monto y currency actuales se preservan. Si algún item tiene currency=UF
 * con un monto que era CLP (bug Santa Hilda), el usuario lo corrige
 * manualmente abriendo el dialog.
 */
/**
 * Borra `FinanceCashflowItem` LEGACY con `source="CONTRACT"` cuyo
 * `sourceRefId` apunta a un `CpqQuote` (modelo viejo, pre 2026-05-11).
 *
 * NO TOCA los items CONTRACT nuevos que apuntan a un `Document` — esos son
 * la tipificación correcta post-fix de 2026-05-12. Filtramos explícitamente
 * por existencia del Quote para evitar borrar registros válidos.
 *
 * Las `FinanceCashflowOccurrence` y `FinanceCashflowIpcAdjustment` asociadas
 * caen por cascade (onDelete: Cascade en el schema). Idempotente.
 */
export async function deleteLegacyContractItems(
  tenantId: string,
): Promise<{ deleted: number }> {
  const candidates = await prisma.financeCashflowItem.findMany({
    where: { tenantId, source: "CONTRACT", sourceRefId: { not: null } },
    select: { id: true, sourceRefId: true },
  });
  const legacyIds: string[] = [];
  for (const item of candidates) {
    if (!item.sourceRefId) continue;
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: item.sourceRefId, tenantId },
      select: { id: true },
    });
    if (quote) legacyIds.push(item.id);
  }
  if (legacyIds.length === 0) return { deleted: 0 };
  const result = await prisma.financeCashflowItem.deleteMany({
    where: { id: { in: legacyIds } },
  });
  return { deleted: result.count };
}

export async function migrateContractItemsToManual(tenantId: string): Promise<{
  migrated: number;
  withDocument: number;
  orphan: number;
}> {
  const items = await prisma.financeCashflowItem.findMany({
    where: { tenantId, source: "CONTRACT" },
    select: { id: true, sourceRefId: true },
  });
  if (items.length === 0) {
    return { migrated: 0, withDocument: 0, orphan: 0 };
  }

  let withDocument = 0;
  let orphan = 0;

  for (const item of items) {
    let newRefId: string | null = item.sourceRefId;

    if (item.sourceRefId) {
      const quote = await prisma.cpqQuote.findFirst({
        where: { id: item.sourceRefId, tenantId },
        select: { dealId: true },
      });
      if (quote?.dealId) {
        // Cualquier Document module=crm asociado al deal. No filtramos por
        // category porque hay variantes (contrato_servicio, contrato_cliente)
        // según plantilla. El primer match gana.
        const assoc = await prisma.docAssociation.findFirst({
          where: {
            entityType: "crm_deal",
            entityId: quote.dealId,
            document: {
              tenantId,
              module: "crm",
            },
          },
          select: { documentId: true },
        });
        if (assoc) {
          newRefId = assoc.documentId;
          withDocument++;
        } else {
          orphan++;
        }
      } else {
        orphan++;
      }
    }

    await prisma.financeCashflowItem.update({
      where: { id: item.id },
      data: { source: "OTHER", sourceRefId: newRefId },
    });
  }

  return { migrated: items.length, withDocument, orphan };
}
