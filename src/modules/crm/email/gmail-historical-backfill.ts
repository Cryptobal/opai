/**
 * Re-dispara un backfill histórico con query Gmail configurable.
 * Idempotente: el upsert de mensajes no duplica; solo consume presupuesto de sync.
 */
import { prisma } from "@/lib/prisma";
import {
  HISTORICAL_BACKFILL_QUERY,
  writeSyncState,
  type GmailSyncState,
} from "./gmail-sync-state";
import { enqueueGmailSyncJob } from "./gmail-sync-queue";

export { DEFAULT_BACKFILL_QUERY, HISTORICAL_BACKFILL_QUERY } from "./gmail-sync-state";

function sanitizeGmailQuery(raw: string): string | null {
  const q = raw.trim().slice(0, 500);
  if (!q) return null;
  // Evita inyección de operadores peligrosos / caracteres de control.
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(q)) return null;
  return q;
}

/**
 * Resetea el estado de backfill de una casilla y encola sync maintenance
 * para importar correo histórico (más allá de la ventana ya sincronizada).
 */
export async function requestHistoricalBackfill(params: {
  tenantId: string;
  emailAccountId: string;
  /** Query Gmail (default: after:2025/01/01 inbox+sent). */
  query?: string | null;
}): Promise<{ ok: true; query: string } | { ok: false; error: string }> {
  const account = await prisma.crmEmailAccount.findFirst({
    where: {
      id: params.emailAccountId,
      tenantId: params.tenantId,
      provider: "gmail",
      status: "active",
    },
    select: { id: true },
  });
  if (!account) return { ok: false, error: "Casilla Gmail no encontrada" };

  const query =
    sanitizeGmailQuery(params.query ?? HISTORICAL_BACKFILL_QUERY) ??
    HISTORICAL_BACKFILL_QUERY;

  const patch: GmailSyncState = {
    backfillDone: false,
    backfillPageToken: null,
    backfillQuery: query,
    lastSyncAt: new Date().toISOString(),
  };
  await writeSyncState(account.id, patch);
  await enqueueGmailSyncJob({
    tenantId: params.tenantId,
    emailAccountId: account.id,
    reason: "historical",
    maintenance: true,
  });
  return { ok: true, query };
}
