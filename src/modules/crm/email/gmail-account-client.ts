import { decryptText, encryptText, getGmailTokenSecret } from "@/lib/crypto";
import { getGmailClient } from "@/lib/gmail";
import { prisma } from "@/lib/prisma";
import {
  extractGmailAttachments,
  type GmailMessagePart,
  type GmailAttachmentMeta,
} from "@/lib/gmail-message-content";
import type { gmail_v1 } from "googleapis";

export type ThreadAttachment = GmailAttachmentMeta & { messageId: string };

/** Cliente Gmail a partir de una casilla (tokens cifrados). Null si no conectada. */
export function gmailClientForAccount(account: {
  id?: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
}): gmail_v1.Gmail | null {
  if (!account.accessTokenEncrypted) return null;
  const secret = getGmailTokenSecret();
  const accessToken = decryptText(account.accessTokenEncrypted, secret);
  const refreshToken = account.refreshTokenEncrypted
    ? decryptText(account.refreshTokenEncrypted, secret)
    : undefined;
  return getGmailClient(accessToken, refreshToken, async (tokens) => {
    if (!account.id || (!tokens.access_token && !tokens.refresh_token && !tokens.expiry_date)) {
      return;
    }
    await prisma.crmEmailAccount.update({
      where: { id: account.id },
      data: {
        ...(tokens.access_token
          ? { accessTokenEncrypted: encryptText(tokens.access_token, secret) }
          : {}),
        ...(tokens.refresh_token
          ? { refreshTokenEncrypted: encryptText(tokens.refresh_token, secret) }
          : {}),
        ...(tokens.expiry_date ? { tokenExpiresAt: new Date(tokens.expiry_date) } : {}),
        ...(tokens.scope ? { grantedScopes: tokens.scope } : {}),
      },
    });
  });
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
