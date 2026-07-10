/**
 * Mutación in-place de la tarjeta de DTEs recibidos: reemplaza el grupo de
 * bloques de UN DTE (section + estado + centro de costo + actions, localizados
 * por sus block_ids estables) por su versión re-renderizada tras acusar o
 * asignar centro de costo, preservando el resto del mensaje.
 *
 * `chat.update` reemplaza el mensaje completo, así que trabajamos sobre el
 * array de bloques del payload (o el mensaje re-fetcheado por conversations.history).
 * Réplica de bank-reconcile-message.ts.
 */

import {
  dteSecBlockId,
  dteCtxBlockId,
  dteStateBlockId,
  dteActBlockId,
} from "./dte-received-blocks";

/**
 * Devuelve una copia de `existing` con el grupo de bloques de `dteId`
 * (sec/state/ctx/act) sustituido por `replacement`. Si no encuentra el grupo,
 * anexa `replacement` al final como fallback.
 */
export function replaceDteInMessage(
  existing: unknown[],
  dteId: string,
  replacement: unknown[],
): unknown[] {
  const ids = new Set([
    dteSecBlockId(dteId),
    dteCtxBlockId(dteId),
    dteStateBlockId(dteId),
    dteActBlockId(dteId),
  ]);
  const out: unknown[] = [];
  let inserted = false;
  for (const b of existing) {
    const bid = (b as { block_id?: string } | null)?.block_id;
    if (bid && ids.has(bid)) {
      if (!inserted) {
        out.push(...replacement);
        inserted = true;
      }
      continue; // descarta los bloques originales del grupo
    }
    out.push(b);
  }
  if (!inserted) out.push(...replacement);
  return out;
}
