/**
 * Acuse SII de un DTE recibido DESDE el mensaje de Slack (los 4 botones:
 * Aceptar / Reclamar contenido / Falta parcial / Falta total).
 *
 * SOLO orquesta: resuelve contexto/actor → gatea capability → llama al servicio
 * existente `applyAcuse` → re-renderiza el bloque del DTE. Cero lógica de acuse
 * nueva. Réplica de bank-reconcile.ts.
 *
 * Desde Slack SIEMPRE `notifySii: true`: el operador toma la decisión oficial
 * (el toggle "solo OPAI" queda para la web). La operación es IRREVERSIBLE — el
 * botón Aceptar trae `confirm` en el Block Kit.
 */

import { logAudit } from "@/lib/audit";
import { hasFacturacionCapability } from "@/lib/permissions";
import {
  applyAcuse,
  type AcuseUserAction,
} from "@/modules/finance/billing/dte-received-acuse.service";
import { renderDteBlocks } from "../dte-received-blocks";
import { loadDteForBlocks } from "../dte-received-load";
import {
  resolveDteReceivedActor,
  ephemeral,
  updateDteCard,
  type DteReceivedPayload,
} from "./dte-received-context";

/** Handler genérico: gatea, acusa y refresca la card. */
async function handleDteAcuse(
  payload: DteReceivedPayload,
  action: AcuseUserAction,
): Promise<void> {
  const actor = await resolveDteReceivedActor(payload);
  if (!actor) return;

  // Mismo gate que el endpoint web POST .../acuse: facturacion_create_draft.
  if (!hasFacturacionCapability(actor.perms, "facturacion_create_draft")) {
    await ephemeral(payload.response_url, "No tenés permiso para acusar DTEs recibidos en el SII.");
    return;
  }

  const dteId = payload.actions?.[0]?.value;
  if (!dteId) {
    await ephemeral(payload.response_url, "Acción inválida.");
    return;
  }

  // applyAcuse revalida DTE↔tenant, dirección RECEIVED y estado PENDING_REVIEW,
  // y devuelve un mensaje human-readable ante cualquier bloqueo.
  const result = await applyAcuse(actor.tenantId, actor.adminId, {
    dteId,
    action,
    notifySii: true,
  });

  if (!result.success) {
    await ephemeral(payload.response_url, `⚠️ ${result.message}`);
    return;
  }

  // Re-render del bloque del DTE con el nuevo estado (recarga desde DB).
  const row = await loadDteForBlocks(actor.tenantId, dteId);
  if (row) await updateDteCard(actor, payload, dteId, renderDteBlocks(row));

  const track = result.trackId ? ` · TrackId ${result.trackId}` : "";
  await ephemeral(payload.response_url, `✅ ${result.message}${track}`);

  await logAudit({
    action: "UPDATE",
    entity: "FinanceDte",
    entityId: dteId,
    tenantId: actor.tenantId,
    userId: actor.adminId,
    details: { operation: "slack_dte_acuse", acuseAction: action, via: "slack" },
  });
}

// Wrappers finos registrados en interactivity.ts.
export const handleDteAccept = (p: DteReceivedPayload) => handleDteAcuse(p, "ACCEPT");
export const handleDteClaimContent = (p: DteReceivedPayload) => handleDteAcuse(p, "CLAIM_CONTENT");
export const handleDteClaimPartial = (p: DteReceivedPayload) => handleDteAcuse(p, "CLAIM_PARTIAL");
export const handleDteClaimTotal = (p: DteReceivedPayload) => handleDteAcuse(p, "CLAIM_TOTAL");
