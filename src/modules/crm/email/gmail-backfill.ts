import type { gmail_v1 } from "googleapis";
import { upsertGmailMessage } from "./gmail-message-upsert";
import { refreshThreadLabelsBatch } from "./gmail-refresh-threads";
import { batchGetGmailMessages } from "./gmail-batch";
import { syncThreadStateFromLocalLabels } from "./gmail-inbox-selfheal";
import {
  DEFAULT_BACKFILL_QUERY,
  computeRefreshDeadline,
  type GmailSyncState,
  type SyncRunArgs,
  type SyncRunResult,
} from "./gmail-sync-state";

const PAGE_SIZE = 100;

/**
 * Backfill histórico paginado. Avanza `backfillPageToken` entre corridas hasta
 * agotar la query → `backfillDone: true` y captura `lastHistoryId` de arranque
 * para el incremental. Respeta budget de mensajes y deadline de tiempo.
 *
 * Tras importar, deriva el estado de carpeta desde `label_ids` locales (gratis)
 * y recién después refresca labels remotos con presupuesto propio.
 */
export async function runBackfill(args: SyncRunArgs): Promise<SyncRunResult> {
  const { gmail, tenantId, emailAccount, budget, deadline, createdByUserId } = args;
  let pageToken = args.state.backfillPageToken ?? undefined;
  let synced = 0;
  let fetched = 0;
  let backfillDone = false;
  const touchedThreadIds = new Set<string>();
  const backfillQuery =
    (typeof args.state.backfillQuery === "string" && args.state.backfillQuery.trim()) ||
    DEFAULT_BACKFILL_QUERY;

  while (fetched < budget && Date.now() < deadline) {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: backfillQuery,
      maxResults: PAGE_SIZE,
      pageToken,
    });
    const pageIds = (list.data.messages ?? [])
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id));
    // S11: fetch de la página en batch (1 llamada por lote vs N gets). Si el
    // batch falla, el upsert degrada al get individual (prefetched=null).
    let prefetched = new Map<string, gmail_v1.Schema$Message>();
    try {
      prefetched = await batchGetGmailMessages({
        gmail,
        accountKey: emailAccount.id,
        ids: pageIds,
        format: "full",
        deadline,
      });
    } catch (err) {
      console.warn("[gmail] backfill batch degradado a gets:", err);
    }
    for (const id of pageIds) {
      fetched += 1;
      const res = await upsertGmailMessage({
        gmail,
        tenantId,
        emailAccount,
        messageId: id,
        createdByUserId,
        prefetched: prefetched.get(id) ?? null,
      });
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

  // Derivación local desde label_ids ya persistidos: gratis (DB-only) y
  // suficiente para que ningún hilo importado nazca en Recibidos por omisión.
  await syncThreadStateFromLocalLabels({
    tenantId,
    emailAccountId: emailAccount.id,
    providerThreadIds: Array.from(touchedThreadIds),
  });

  await refreshThreadLabelsBatch({
    gmail,
    tenantId,
    emailAccountId: emailAccount.id,
    threadIds: touchedThreadIds,
    deadline: computeRefreshDeadline(args.hardDeadline),
  });

  const state: GmailSyncState = {
    ...args.state,
    backfillQuery,
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
