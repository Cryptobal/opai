import type { gmail_v1 } from "googleapis";

/**
 * Construye el set de `threadId` reales de Gmail para un label, paginando
 * `users.messages.list` con campos livianos. `maxPages` acota el costo
 * (500 mensajes por página).
 */
export async function listGmailThreadIdSet(params: {
  gmail: gmail_v1.Gmail;
  labelId: "INBOX" | "TRASH" | "SPAM";
  maxPages: number;
  deadline: number;
}): Promise<Set<string>> {
  const set = new Set<string>();
  let pageToken: string | undefined;
  for (let i = 0; i < params.maxPages; i++) {
    if (Date.now() >= params.deadline) break;
    const res = await params.gmail.users.messages.list({
      userId: "me",
      labelIds: [params.labelId],
      includeSpamTrash: true,
      maxResults: 500,
      fields: "messages(threadId),nextPageToken",
      pageToken,
    });
    for (const m of res.data.messages ?? []) {
      if (m.threadId) set.add(m.threadId);
    }
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return set;
}
