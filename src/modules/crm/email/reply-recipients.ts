import { normalizeEmailAddress, normalizeEmailList } from "@/lib/email-address";

export type ReplyAllRecipients = { to: string[]; cc: string[] };

/**
 * Calcula los destinatarios de "Responder a todos" a partir del último mensaje
 * inbound del hilo: `to = [fromEmail]`, `cc = (toEmails ∪ ccEmails)` menos la
 * casilla propia y el remitente, deduplicado y en minúsculas.
 */
export function computeReplyAllRecipients(params: {
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  ownEmail: string;
}): ReplyAllRecipients {
  const from = normalizeEmailAddress(params.fromEmail);
  const own = normalizeEmailAddress(params.ownEmail);
  const cc = normalizeEmailList([...params.toEmails, ...params.ccEmails]).filter(
    (e) => e !== own && e !== from,
  );
  return { to: [from], cc };
}
