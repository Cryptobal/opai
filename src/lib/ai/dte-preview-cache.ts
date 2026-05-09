/**
 * Cache en memoria para el patrón two-step de creación de DTEs:
 * preview_*_draft → confirma con el usuario → create_*_draft({previewToken}).
 *
 * TTL corto (5 min) y single-use: una vez consumido, el token desaparece.
 * Si Vercel reinicia el proceso entre invocaciones, el peor caso es que el
 * usuario tenga que volver a pedir el preview — no hay riesgo de duplicar
 * un DTE.
 */
import { randomUUID } from "node:crypto";

export type DtePreviewToolName =
  | "create_invoice_draft"
  | "create_credit_note_draft"
  | "create_debit_note_draft"
  | "create_recurring_invoice";

export type PreviewPayload = {
  tenantId: string;
  userId: string;
  toolName: DtePreviewToolName;
  args: Record<string, unknown>;
  computed: {
    netAmount: number;
    exemptAmount: number;
    taxAmount: number;
    totalAmount: number;
    currency: string;
    receiverRut: string;
    receiverName: string;
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
  expectedToolName: DtePreviewToolName,
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
