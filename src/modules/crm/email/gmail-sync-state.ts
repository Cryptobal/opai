import { prisma } from "@/lib/prisma";
import type { gmail_v1 } from "googleapis";

/** Estado de sync persistido en `crmEmailAccount.syncState` (JSON). */
export type GmailSyncState = {
  /** pageToken de backfill en curso (null = agotado). */
  backfillPageToken?: string | null;
  /** true cuando el backfill de 120d terminó. */
  backfillDone?: boolean;
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
};

export type SyncRunResult = { synced: number; fetched: number; state: GmailSyncState };

export function readSyncState(raw: unknown): GmailSyncState {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as GmailSyncState;
  }
  return {};
}

/** Merge parcial sobre el syncState actual (read-modify-write). */
export async function writeSyncState(
  emailAccountId: string,
  patch: GmailSyncState,
): Promise<void> {
  const acc = await prisma.crmEmailAccount.findUnique({
    where: { id: emailAccountId },
    select: { syncState: true },
  });
  const next = { ...readSyncState(acc?.syncState), ...patch };
  await prisma.crmEmailAccount.update({
    where: { id: emailAccountId },
    data: { syncState: next },
  });
}
