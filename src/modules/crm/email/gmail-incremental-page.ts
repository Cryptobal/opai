import type { gmail_v1 } from "googleapis";
import { upsertGmailMessage } from "./gmail-message-upsert";
import { refreshThreadLabelsBatch } from "./gmail-refresh-threads";
import { batchGetGmailMessages } from "./gmail-batch";
import { syncThreadStateFromLocalLabels } from "./gmail-inbox-selfheal";
import { computeRefreshDeadline, type SyncRunArgs } from "./gmail-sync-state";

export type HistoryPage = {
  /** messageId de `messagesAdded` a upsertear. */
  ids: Set<string>;
  /** threadId con cambios de labels o mensajes borrados → refresh de hilo. */
  labelThreadIds: Set<string>;
  /** Mayor id de registro de historia de la página (viene ascendente). */
  maxHistoryRecordId: string | null;
};

export function collectHistoryPage(history: gmail_v1.Schema$History[]): HistoryPage {
  const ids = new Set<string>();
  const labelThreadIds = new Set<string>();
  let maxHistoryRecordId: string | null = null;
  for (const h of history) {
    if (h.id) maxHistoryRecordId = String(h.id);
    for (const ma of h.messagesAdded ?? []) {
      if (ma.message?.id) ids.add(ma.message.id);
    }
    for (const md of h.messagesDeleted ?? []) {
      if (md.message?.threadId) labelThreadIds.add(md.message.threadId);
    }
    for (const la of [...(h.labelsAdded ?? []), ...(h.labelsRemoved ?? [])]) {
      if (la.message?.threadId) labelThreadIds.add(la.message.threadId);
    }
  }
  return { ids, labelThreadIds, maxHistoryRecordId };
}

export type PageCounters = { synced: number; fetched: number };

/**
 * Procesa una página de `history.list` completa: upsert de mensajes nuevos y
 * refresh del estado de cada hilo tocado. Retorna `true` solo si la página
 * quedó COMPLETA (sin cortes por budget/deadline): recién ahí el caller puede
 * avanzar `lastHistoryId` sin perder cambios.
 */
export async function processHistoryPage(
  args: SyncRunArgs,
  page: HistoryPage,
  counters: PageCounters,
): Promise<boolean> {
  const { gmail, tenantId, emailAccount, budget, deadline, createdByUserId } = args;
  const threadIds = new Set(page.labelThreadIds);
  // S11: fetch de los mensajes nuevos de la página en batch; degrada a gets.
  let prefetched = new Map<string, gmail_v1.Schema$Message>();
  if (page.ids.size > 1) {
    try {
      prefetched = await batchGetGmailMessages({
        gmail,
        accountKey: emailAccount.id,
        ids: Array.from(page.ids),
        format: "full",
        deadline,
      });
    } catch (err) {
      console.warn("[gmail] incremental batch degradado a gets:", err);
    }
  }
  for (const id of page.ids) {
    if (counters.fetched >= budget || Date.now() >= deadline) return false;
    counters.fetched += 1;
    const res = await upsertGmailMessage({
      gmail,
      tenantId,
      emailAccount,
      messageId: id,
      createdByUserId,
      prefetched: prefetched.get(id) ?? null,
    });
    if (res.wrote) counters.synced += 1;
    if (res.providerThreadId) threadIds.add(res.providerThreadId);
  }
  await syncThreadStateFromLocalLabels({
    tenantId,
    emailAccountId: emailAccount.id,
    providerThreadIds: Array.from(threadIds),
  });
  const refreshed = await refreshThreadLabelsBatch({
    gmail,
    tenantId,
    emailAccountId: emailAccount.id,
    threadIds,
    deadline: computeRefreshDeadline(args.hardDeadline),
  });
  return refreshed >= threadIds.size;
}
