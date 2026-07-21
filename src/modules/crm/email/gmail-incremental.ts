import { upsertGmailMessage } from "./gmail-message-upsert";
import { refreshThreadLabelsFromGmail } from "./gmail-thread-actions";
import type { GmailSyncState, SyncRunArgs, SyncRunResult } from "./gmail-sync-state";

const FALLBACK_QUERY = "newer_than:7d (in:inbox OR in:sent)";

function statusOf(err: unknown): number | undefined {
  const e = err as { code?: number; status?: number; response?: { status?: number } };
  return e?.code ?? e?.status ?? e?.response?.status;
}

async function processIds(args: SyncRunArgs, ids: string[]): Promise<{ synced: number; fetched: number }> {
  const { gmail, tenantId, emailAccount, budget, deadline, createdByUserId } = args;
  let synced = 0;
  let fetched = 0;
  for (const id of ids) {
    if (fetched >= budget || Date.now() >= deadline) break;
    fetched += 1;
    if (await upsertGmailMessage({ gmail, tenantId, emailAccount, messageId: id, createdByUserId })) {
      synced += 1;
    }
  }
  return { synced, fetched };
}

/** Sync corto por query (cuando no hay historyId o expiró). Re-captura lastHistoryId. */
async function fallbackSync(args: SyncRunArgs): Promise<SyncRunResult> {
  const { gmail } = args;
  const list = await gmail.users.messages.list({
    userId: "me",
    q: FALLBACK_QUERY,
    maxResults: Math.min(args.budget, 50),
  });
  const ids = (list.data.messages ?? []).map((m) => m.id).filter((x): x is string => Boolean(x));
  const { synced, fetched } = await processIds(args, ids);

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
 * Incremental por `users.history.list(startHistoryId)`. Trae sólo lo nuevo
 * (`messageAdded`). Si el historyId expiró (404) → fallback corto reiniciando
 * `lastHistoryId`.
 */
export async function runIncremental(args: SyncRunArgs): Promise<SyncRunResult> {
  const startHistoryId = args.state.lastHistoryId;
  if (!startHistoryId) return fallbackSync(args);

  try {
    const ids = new Set<string>();
    const labelThreadIds = new Set<string>();
    let pageToken: string | undefined;
    let newestHistoryId = startHistoryId;
    do {
      const res = await args.gmail.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded", "labelAdded", "labelRemoved"],
        maxResults: 100,
        pageToken,
      });
      if (res.data.historyId) newestHistoryId = String(res.data.historyId);
      for (const h of res.data.history ?? []) {
        for (const ma of h.messagesAdded ?? []) {
          if (ma.message?.id) ids.add(ma.message.id);
        }
        for (const la of [...(h.labelsAdded ?? []), ...(h.labelsRemoved ?? [])]) {
          if (la.message?.threadId) labelThreadIds.add(la.message.threadId);
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken && ids.size < args.budget && Date.now() < args.deadline);

    const { synced, fetched } = await processIds(args, Array.from(ids));
    for (const tid of labelThreadIds) {
      if (Date.now() >= args.deadline) break;
      await refreshThreadLabelsFromGmail({
        gmail: args.gmail,
        tenantId: args.tenantId,
        emailAccountId: args.emailAccount.id,
        providerThreadId: tid,
      });
    }
    const state: GmailSyncState = {
      ...args.state,
      lastHistoryId: newestHistoryId,
      lastSyncAt: new Date().toISOString(),
    };
    return { synced, fetched, state };
  } catch (err) {
    if (statusOf(err) === 404) return fallbackSync(args);
    throw err;
  }
}
