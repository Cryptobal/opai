import { prisma } from "@/lib/prisma";
import { decryptText } from "@/lib/crypto";
import { getGmailClient } from "@/lib/gmail";
import { readSyncState, writeSyncState, type SyncRunArgs } from "./gmail-sync-state";
import { runBackfill } from "./gmail-backfill";
import { runIncremental } from "./gmail-incremental";

const DEFAULT_BUDGET = 300;
const TIME_BUDGET_MS = 45_000;

/**
 * Sync de una casilla Gmail. Decide backfill (histórico 120d paginado) o
 * incremental (`historyId`) según `syncState`. Guarda TODOS los threads del
 * usuario; el matching a contacto/cuenta/deal es enriquecimiento.
 *
 * @param maxResults  budget de mensajes por corrida (default 300).
 * @param deadlineMs  timestamp absoluto para cortar (el cron lo comparte entre
 *                    casillas para no exceder su maxDuration).
 */
export async function syncGmailAccount(params: {
  tenantId: string;
  emailAccountId: string;
  maxResults?: number;
  deadlineMs?: number;
  createdByUserId?: string | null;
}): Promise<{ syncedCount: number; fetched: number; mode: "backfill" | "incremental" }> {
  const emailAccount = await prisma.crmEmailAccount.findFirst({
    where: {
      id: params.emailAccountId,
      tenantId: params.tenantId,
      provider: "gmail",
      status: "active",
    },
  });
  if (!emailAccount?.accessTokenEncrypted) {
    throw new Error("Gmail no conectado");
  }

  const tokenSecret = process.env.GMAIL_TOKEN_SECRET || "dev-secret";
  const accessToken = decryptText(emailAccount.accessTokenEncrypted, tokenSecret);
  const refreshToken = emailAccount.refreshTokenEncrypted
    ? decryptText(emailAccount.refreshTokenEncrypted, tokenSecret)
    : undefined;
  const gmail = getGmailClient(accessToken, refreshToken);

  const state = readSyncState(emailAccount.syncState);
  const runArgs: SyncRunArgs = {
    gmail,
    tenantId: params.tenantId,
    emailAccount: { id: emailAccount.id, email: emailAccount.email, userId: emailAccount.userId },
    state,
    budget: Math.max(params.maxResults ?? DEFAULT_BUDGET, 1),
    deadline: params.deadlineMs ?? Date.now() + TIME_BUDGET_MS,
    createdByUserId: params.createdByUserId,
  };

  const mode: "backfill" | "incremental" = state.backfillDone ? "incremental" : "backfill";
  const result = mode === "backfill" ? await runBackfill(runArgs) : await runIncremental(runArgs);
  await writeSyncState(emailAccount.id, result.state);
  return { syncedCount: result.synced, fetched: result.fetched, mode };
}
