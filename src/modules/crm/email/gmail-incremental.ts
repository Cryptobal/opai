import { upsertGmailMessage } from "./gmail-message-upsert";
import { refreshThreadLabelsBatch } from "./gmail-refresh-threads";
import { collectHistoryPage, processHistoryPage, type PageCounters } from "./gmail-incremental-page";
import { reconcileGmailFolders } from "./gmail-folder-reconcile";
import type { GmailSyncState, SyncRunArgs, SyncRunResult } from "./gmail-sync-state";

const FALLBACK_QUERY = "newer_than:7d (in:inbox OR in:sent)";

function statusOf(err: unknown): number | undefined {
  const e = err as { code?: number; status?: number; response?: { status?: number } };
  return e?.code ?? e?.status ?? e?.response?.status;
}

/** Sync corto por query (cuando no hay historyId o expiró). Re-captura lastHistoryId. */
async function fallbackSync(args: SyncRunArgs): Promise<SyncRunResult> {
  const { gmail, tenantId, emailAccount, budget, deadline, createdByUserId } = args;
  const list = await gmail.users.messages.list({
    userId: "me",
    q: FALLBACK_QUERY,
    maxResults: Math.min(budget, 50),
  });
  const ids = (list.data.messages ?? []).map((m) => m.id).filter((x): x is string => Boolean(x));
  let synced = 0;
  let fetched = 0;
  const threadIds = new Set<string>();
  for (const id of ids) {
    if (fetched >= budget || Date.now() >= deadline) break;
    fetched += 1;
    const res = await upsertGmailMessage({ gmail, tenantId, emailAccount, messageId: id, createdByUserId });
    if (res.wrote) synced += 1;
    if (res.providerThreadId) threadIds.add(res.providerThreadId);
  }
  await refreshThreadLabelsBatch({
    gmail,
    tenantId,
    emailAccountId: emailAccount.id,
    threadIds,
    deadline,
  });
  // La query de fallback excluye TRASH/SPAM. El sweep recupera esos cambios
  // en mantenimiento; el webhook realtime lo omite para mantener baja latencia.
  if (args.maintenance !== false) {
    await reconcileGmailFolders({ gmail, tenantId, emailAccount, deadline });
  }

  let lastHistoryId = args.state.lastHistoryId ?? null;
  try {
    const profile = await gmail.users.getProfile({ userId: "me" });
    if (profile.data.historyId) lastHistoryId = String(profile.data.historyId);
  } catch {
    /* ignore */
  }
  const state: GmailSyncState = { ...args.state, lastHistoryId, lastSyncAt: new Date().toISOString() };
  return { synced, fetched, state };
}

/**
 * Incremental por `users.history.list(startHistoryId)`, procesado POR PÁGINA:
 * cada página se upserta y refresca ANTES de pedir la siguiente, y solo al
 * completarla se avanza el `historyId` comprometido. Si budget/deadline corta
 * a mitad de página, se persiste el historyId de la última página completada
 * (o el original) → la próxima corrida retoma sin perder cambios de labels.
 * Si el historyId expiró (404) → fallback corto reiniciando `lastHistoryId`.
 */
export async function runIncremental(args: SyncRunArgs): Promise<SyncRunResult> {
  const startHistoryId = args.state.lastHistoryId;
  if (!startHistoryId) return fallbackSync(args);

  try {
    const counters: PageCounters = { synced: 0, fetched: 0 };
    let committedHistoryId = startHistoryId;
    let newestHistoryId = startHistoryId;
    let pageToken: string | undefined;
    let allPagesDone = true;

    do {
      const res = await args.gmail.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded", "labelAdded", "labelRemoved", "messageDeleted"],
        maxResults: 100,
        pageToken,
      });
      if (res.data.historyId) newestHistoryId = String(res.data.historyId);
      const page = collectHistoryPage(res.data.history ?? []);
      const completed = await processHistoryPage(args, page, counters);
      if (!completed) {
        allPagesDone = false;
        break;
      }
      if (page.maxHistoryRecordId) committedHistoryId = page.maxHistoryRecordId;
      pageToken = res.data.nextPageToken ?? undefined;
      if (pageToken && (counters.fetched >= args.budget || Date.now() >= args.deadline)) {
        allPagesDone = false;
        break;
      }
    } while (pageToken);

    const state: GmailSyncState = {
      ...args.state,
      lastHistoryId: allPagesDone ? newestHistoryId : committedHistoryId,
      lastSyncAt: new Date().toISOString(),
    };
    return { synced: counters.synced, fetched: counters.fetched, state };
  } catch (err) {
    if (statusOf(err) === 404) return fallbackSync(args);
    throw err;
  }
}
