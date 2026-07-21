/** Payload decodificado del mensaje Pub/Sub de Gmail push. */
export type GmailPushPayload = {
  emailAddress?: string;
  historyId?: string;
};

type PubSubEnvelope = {
  message?: { data?: string; messageId?: string; publishTime?: string };
  subscription?: string;
};

/** Decodifica el body Pub/Sub; null si no parsea. */
export function parseGmailPushBody(raw: unknown): GmailPushPayload | null {
  const body = raw as PubSubEnvelope | null;
  const dataB64 = body?.message?.data;
  if (!dataB64) return null;
  try {
    return JSON.parse(Buffer.from(dataB64, "base64").toString("utf8")) as GmailPushPayload;
  } catch {
    return null;
  }
}
