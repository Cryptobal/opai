import { decryptText } from "@/lib/crypto";
import { getGmailClient } from "@/lib/gmail";
import {
  extractGmailAttachments,
  type GmailMessagePart,
  type GmailAttachmentMeta,
} from "@/lib/gmail-message-content";
import type { gmail_v1 } from "googleapis";

export type ThreadAttachment = GmailAttachmentMeta & { messageId: string };

/** Cliente Gmail a partir de una casilla (tokens cifrados). Null si no conectada. */
export function gmailClientForAccount(account: {
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
}): gmail_v1.Gmail | null {
  if (!account.accessTokenEncrypted) return null;
  const secret = process.env.GMAIL_TOKEN_SECRET || "dev-secret";
  const accessToken = decryptText(account.accessTokenEncrypted, secret);
  const refreshToken = account.refreshTokenEncrypted
    ? decryptText(account.refreshTokenEncrypted, secret)
    : undefined;
  return getGmailClient(accessToken, refreshToken);
}

/** Adjuntos (metadata) de un hilo Gmail: filename, mime, size, attachmentId. */
export async function listThreadAttachments(
  gmail: gmail_v1.Gmail,
  providerThreadId: string,
): Promise<ThreadAttachment[]> {
  const thread = await gmail.users.threads.get({
    userId: "me",
    id: providerThreadId,
    format: "full",
  });
  const out: ThreadAttachment[] = [];
  for (const msg of thread.data.messages ?? []) {
    if (!msg.id) continue;
    for (const att of extractGmailAttachments(msg.payload as GmailMessagePart | undefined)) {
      out.push({ ...att, messageId: msg.id });
    }
  }
  return out;
}
