import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { gmail_v1 } from "googleapis";

/** Query Gmail por defecto del backfill inicial (inbox+sent, 365 días). */
export const DEFAULT_BACKFILL_QUERY = "newer_than:365d (in:inbox OR in:sent)";

/** Query histórica por defecto al pedir reimportación ampliada. */
export const HISTORICAL_BACKFILL_QUERY = "after:2025/01/01 (in:inbox OR in:sent)";

/** Estado de sync persistido en `crmEmailAccount.syncState` (JSON). */
export type GmailSyncState = {
  /** pageToken de backfill en curso (null = agotado). */
  backfillPageToken?: string | null;
  /** true cuando el backfill de la query actual terminó. */
  backfillDone?: boolean;
  /**
   * Query Gmail del backfill en curso (default: newer_than:365d inbox+sent).
   * Permite re-backfill histórico sin tocar el código (p. ej. after:2025/01/01).
   */
  backfillQuery?: string | null;
  /** historyId para el incremental (`users.history.list`). */
  lastHistoryId?: string | null;
  /** ISO de la última corrida. */
  lastSyncAt?: string;
  /** ISO del último sweep de reconciliación de carpetas. */
  lastReconcileAt?: string | null;
  /** true si el último sweep corrió con los 3 sets completos. */
  lastReconcileComplete?: boolean;
  /** ISO de la última corrida del Radar Comercial sobre esta casilla. */
  lastRadarRunAt?: string | null;
  /** Nº de hilos analizados por el Radar en la última corrida. */
  lastRadarClassified?: number;
  /** Estado del `users.watch` Pub/Sub (Gmail push). */
  watch?: {
    historyId?: string | null;
    expiration?: number;
    registeredAt?: string;
    scope?: "mailbox";
  };
  /** Coalescing anti-tormenta del webhook push. */
  push?: {
    lastPushAt?: string;
    lastPushHistoryId?: string;
  };
};

export type EmailAccountLite = { id: string; email: string; userId: string };

/** Argumentos compartidos por los runners de backfill / incremental. */
export type SyncRunArgs = {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccount: EmailAccountLite;
  state: GmailSyncState;
  /** Máx. mensajes a procesar en esta corrida. */
  budget: number;
  /** Timestamp absoluto (ms) a partir del cual se corta la corrida. */
  deadline: number;
  createdByUserId?: string | null;
  /** false en el webhook: evita sweeps caros cuando historyId expiró. */
  maintenance?: boolean;
};

export type SyncRunResult = { synced: number; fetched: number; state: GmailSyncState };

export function readSyncState(raw: unknown): GmailSyncState {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as GmailSyncState;
  }
  return {};
}

/**
 * Merge JSONB atómico sobre el syncState actual.
 *
 * Antes se hacía read-modify-write desde Node y cron + webhook podían pisarse
 * mutuamente (por ejemplo, perder `lastHistoryId` al renovar el watch).
 */
export async function writeSyncState(
  emailAccountId: string,
  patch: GmailSyncState,
): Promise<void> {
  const json = JSON.stringify(patch);
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "crm"."email_accounts"
      SET
        "sync_state" = COALESCE("sync_state", '{}'::jsonb) || ${json}::jsonb,
        "updated_at" = NOW()
      WHERE "id" = ${emailAccountId}::uuid
    `,
  );
}
