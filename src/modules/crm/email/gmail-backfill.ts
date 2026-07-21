import { upsertGmailMessage } from "./gmail-message-upsert";
import { refreshThreadLabelsBatch } from "./gmail-refresh-threads";
import type { GmailSyncState, SyncRunArgs, SyncRunResult } from "./gmail-sync-state";

/** INBOX + SENT de los últimos 120 días (excluye spam/trash/chats). */
const BACKFILL_QUERY = "newer_than:120d (in:inbox OR in:sent)";
const PAGE_SIZE = 100;

/**
 * Backfill histórico paginado. Avanza `backfillPageToken` entre corridas hasta
 * agotar la query → `backfillDone: true` y captura `lastHistoryId` de arranque
 * para el incremental. Respeta budget de mensajes y deadline de tiempo.
 * Al final refresca el estado de labels de cada hilo tocado (por hilo, no por
 * mensaje: un SENT individual no debe archivar el hilo).
 */
export async function runBackfill(args: SyncRunArgs): Promise<SyncRunResult> {
  const { gmail, tenantId, emailAccount, budget, deadline, createdByUserId } = args;
  let pageToken = args.state.backfillPageToken ?? undefined;
  let synced = 0;
  let fetched = 0;
  let backfillDone = false;
  const touchedThreadIds = new Set<string>();

  while (fetched < budget && Date.now() < deadline) {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: BACKFILL_QUERY,
      maxResults: PAGE_SIZE,
      pageToken,
    });
    for (const m of list.data.messages ?? []) {
      if (!m.id) continue;
      fetched += 1;
      const res = await upsertGmailMessage({ gmail, tenantId, emailAccount, messageId: m.id, createdByUserId });
      if (res.wrote) synced += 1;
      if (res.providerThreadId) touchedThreadIds.add(res.providerThreadId);
      if (fetched >= budget || Date.now() >= deadline) break;
    }
    pageToken = list.data.nextPageToken ?? undefined;
    if (!pageToken) {
      backfillDone = true;
      break;
    }
  }

  await refreshThreadLabelsBatch({
    gmail,
    tenantId,
    emailAccountId: emailAccount.id,
    threadIds: touchedThreadIds,
    deadline,
  });

  const state: GmailSyncState = {
    ...args.state,
    backfillPageToken: pageToken ?? null,
    lastSyncAt: new Date().toISOString(),
  };
  if (backfillDone) {
    state.backfillDone = true;
    try {
      const profile = await gmail.users.getProfile({ userId: "me" });
      if (profile.data.historyId) state.lastHistoryId = String(profile.data.historyId);
    } catch {
      /* si falla getProfile, el incremental hará fallback y capturará historyId */
    }
  }
  return { synced, fetched, state };
}
