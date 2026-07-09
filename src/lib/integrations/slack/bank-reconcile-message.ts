/**
 * Mutación in-place de la tarjeta de movimientos: reemplaza el grupo de bloques
 * de UN movimiento (section + context + actions, localizados por sus block_ids
 * estables) por el estado resuelto ✓ (o por su estado pendiente re-renderizado
 * tras un "Deshacer"), preservando el resto del mensaje.
 *
 * `chat.update` reemplaza el mensaje completo, así que trabajamos sobre el array
 * de bloques que viene en el payload del block_action (`message.blocks`).
 */

import { secBlockId, ctxBlockId, actBlockId } from "./bank-reconcile-blocks";

const pt = (text: string) => ({ type: "plain_text" as const, text: text.slice(0, 75), emoji: true });

/**
 * Estado resuelto de un movimiento: línea ✓ + (opcional) botón Deshacer.
 *
 * El botón de undo usa `actBlockId(txId)` (el MISMO block_id del grupo de
 * acciones original) a propósito: así `replaceMovementInMessage` lo incluye
 * en el grupo y lo sustituye tanto al re-conciliar como al deshacer — si usara
 * un id propio (p.ej. por pendingId) quedaría huérfano tras el "Deshacer".
 */
export function resolvedMovementBlocks(
  txId: string,
  statusText: string,
  undoPendingId: string | null,
): unknown[] {
  const blocks: unknown[] = [
    { type: "section", block_id: secBlockId(txId), text: { type: "mrkdwn", text: `✅ ${statusText}` } },
  ];
  if (undoPendingId) {
    blocks.push({
      type: "actions",
      block_id: actBlockId(txId),
      elements: [{
        type: "button",
        action_id: "bankreconc_undo",
        value: undoPendingId,
        text: pt("↩︎ Deshacer (15 min)"),
      }],
    });
  }
  return blocks;
}

/**
 * Devuelve una copia de `existing` con el grupo de bloques de `txId` (sec/ctx/act)
 * sustituido por `replacement`. Si no encuentra el grupo (mensaje inesperado),
 * anexa `replacement` al final como fallback para que el usuario vea el desenlace.
 */
export function replaceMovementInMessage(
  existing: unknown[],
  txId: string,
  replacement: unknown[],
): unknown[] {
  const ids = new Set([secBlockId(txId), ctxBlockId(txId), actBlockId(txId)]);
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
