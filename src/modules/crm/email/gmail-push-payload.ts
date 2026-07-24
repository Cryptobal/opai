/** Payload decodificado del mensaje Pub/Sub de Gmail push. */
export type GmailPushPayload = {
  emailAddress: string;
  historyId?: string;
};

type PubSubEnvelope = {
  message?: { data?: string; messageId?: string; publishTime?: string };
  subscription?: string;
};

/**
 * Gmail documenta `historyId` como string decimal, pero algunos publishers lo
 * serializan como number. Solo aceptamos enteros positivos representables sin
 * pérdida; un valor inválido se omite y el push igualmente se encola para que
 * el worker avance desde su `lastHistoryId` persistido.
 */
export function normalizeGmailHistoryId(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return /^[1-9]\d*$/.test(normalized) ? normalized : undefined;
  }
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  ) {
    return String(value);
  }
  return undefined;
}

/** Decodifica y valida el body Pub/Sub; null si falta la casilla. */
export function parseGmailPushBody(raw: unknown): GmailPushPayload | null {
  const body = raw as PubSubEnvelope | null;
  const dataB64 = body?.message?.data;
  if (!dataB64) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(dataB64, "base64").toString("utf8"),
    ) as { emailAddress?: unknown; historyId?: unknown } | null;
    if (
      !decoded ||
      typeof decoded.emailAddress !== "string" ||
      decoded.emailAddress.trim() === ""
    ) {
      return null;
    }
    const historyId = normalizeGmailHistoryId(decoded.historyId);
    return {
      emailAddress: decoded.emailAddress.trim(),
      ...(historyId ? { historyId } : {}),
    };
  } catch {
    return null;
  }
}
