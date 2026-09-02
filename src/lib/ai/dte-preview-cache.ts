/**
 * Cache en memoria para el patrón two-step: preview_* → usuario confirma → tool persistente.
 * El `toolName` almacenado es siempre la herramienta FINAL (persistente), igual que en DTEs.
 */

import { randomUUID } from "node:crypto";

/** Nombres de tools persistentes enlazadas a previews de facturación. */
export type DtePreviewToolName =
  | "create_invoice_draft"
  | "create_credit_note_draft"
  | "create_debit_note_draft"
  | "create_recurring_invoice"
  | "update_invoice_draft_refs"
  | "update_recurring_invoice_refs"
  | "emit_invoice_draft";

export type CpqPersistToolName =
  | "update_quote_position"
  | "remove_quote_position"
  | "send_quote_proposal";

export type LicitacionPersistToolName =
  | "licitacion_aplicar_indice"
  | "licitacion_aplicar_cambio"
  | "licitacion_regenerar_seccion"
  | "propuesta_editar_seccion";

export type BankingPersistToolName =
  | "classify_bank_to_flow_row"
  | "authorize_bank_movements";

export type CrmComercialPersistToolName =
  | "delete_deal"
  | "delete_quote"
  | "delete_lead"
  | "approve_lead"
  | "reject_lead";

export type PreviewBackedToolName =
  | DtePreviewToolName
  | CpqPersistToolName
  | LicitacionPersistToolName
  | BankingPersistToolName
  | CrmComercialPersistToolName;

export type PreviewPayload = {
  tenantId: string;
  userId: string;
  toolName: PreviewBackedToolName;
  args: Record<string, unknown>;
  computed: {
    [k: string]: unknown;
  };
  expiresAt: number;
};

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, PreviewPayload>();

function gc() {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (v.expiresAt < now) cache.delete(k);
  }
}

export function storePreview(payload: Omit<PreviewPayload, "expiresAt">): string {
  gc();
  const token = randomUUID();
  cache.set(token, { ...payload, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function consumePreview(
  token: string,
  expectedTenantId: string,
  expectedUserId: string,
  expectedToolName: PreviewBackedToolName,
): PreviewPayload | null {
  gc();
  const p = cache.get(token);
  if (!p) return null;
  if (p.tenantId !== expectedTenantId) return null;
  if (p.userId !== expectedUserId) return null;
  if (p.toolName !== expectedToolName) return null;
  if (p.expiresAt < Date.now()) {
    cache.delete(token);
    return null;
  }
  cache.delete(token);
  return p;
}
