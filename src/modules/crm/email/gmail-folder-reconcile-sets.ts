import type { gmail_v1 } from "googleapis";

export type GmailThreadIdSet = { ids: Set<string>; complete: boolean };

/**
 * Construye el set de `threadId` reales de Gmail para un label, paginando
 * `users.messages.list` con campos livianos. `maxPages` acota el costo
 * (500 mensajes por página).
 *
 * `complete` es `true` solo cuando Gmail respondió sin `nextPageToken`
 * pendiente. Si el loop cortó por `deadline` o agotó `maxPages` con token
 * pendiente, el set es parcial: la pertenencia positiva sigue siendo
 * confiable, la ausencia NO.
 */
export async function listGmailThreadIdSet(params: {
  gmail: gmail_v1.Gmail;
  labelId: "INBOX" | "TRASH" | "SPAM";
  maxPages: number;
  deadline: number;
}): Promise<GmailThreadIdSet> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  for (let i = 0; i < params.maxPages; i++) {
    if (Date.now() >= params.deadline) {
      return { ids, complete: false };
    }
    const res = await params.gmail.users.messages.list({
      userId: "me",
      labelIds: [params.labelId],
      includeSpamTrash: true,
      maxResults: 500,
      fields: "messages(threadId),nextPageToken",
      pageToken,
    });
    for (const m of res.data.messages ?? []) {
      if (m.threadId) ids.add(m.threadId);
    }
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) return { ids, complete: true };
  }
  return { ids, complete: false };
}
