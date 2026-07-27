import {
  extractEmailAddresses,
  normalizeEmailAddress,
  normalizeEmailList,
} from "@/lib/email-address";

export type ReplyAllRecipients = { to: string[]; cc: string[] };

/** Destinatario de "Responder": prefiere Reply-To sobre From (listas/grupos). */
export function preferredReplyAddress(params: {
  fromEmail: string;
  replyToEmail?: string | null;
}): string {
  const replyTo =
    extractEmailAddresses(params.replyToEmail ?? "")[0] ??
    (params.replyToEmail ? normalizeEmailAddress(params.replyToEmail) : "");
  if (replyTo) return replyTo;
  return (
    extractEmailAddresses(params.fromEmail)[0] ??
    normalizeEmailAddress(params.fromEmail)
  );
}

/**
 * Calcula los destinatarios de "Responder a todos" a partir del último mensaje
 * inbound del hilo: `to = [replyTo|fromEmail]`, `cc = (toEmails ∪ ccEmails)`
 * menos la casilla propia y el remitente, deduplicado y en minúsculas.
 */
export function computeReplyAllRecipients(params: {
  fromEmail: string;
  replyToEmail?: string | null;
  toEmails: string[];
  ccEmails: string[];
  ownEmail: string;
}): ReplyAllRecipients {
  const from = preferredReplyAddress({
    fromEmail: params.fromEmail,
    replyToEmail: params.replyToEmail,
  });
  const own =
    extractEmailAddresses(params.ownEmail)[0] ??
    normalizeEmailAddress(params.ownEmail);
  const cc = normalizeEmailList([...params.toEmails, ...params.ccEmails]).filter(
    (e) => e !== own && e !== from,
  );
  return { to: from ? [from] : [], cc };
}
