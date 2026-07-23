/**
 * Batch HTTP de Gmail (S11): baja N mensajes en UNA llamada al endpoint
 * `POST /batch/gmail/v1` (multipart/mixed), en vez de N `messages.get`.
 * Lo usan backfill e incremental para el fetch masivo. Best-effort: si el
 * batch falla, los callers degradan al fetch por mensaje de siempre.
 */
import type { gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { runWithGmailQuota } from "./gmail-adapter";

const BATCH_ENDPOINT = "https://gmail.googleapis.com/batch/gmail/v1";
/** Gmail acepta hasta 100 por batch; 40 mantiene las respuestas manejables. */
const BATCH_CHUNK = 40;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function accessTokenOf(gmail: gmail_v1.Gmail): Promise<string | null> {
  const auth = (gmail.context?._options as { auth?: OAuth2Client } | undefined)?.auth;
  if (!auth || typeof auth.getAccessToken !== "function") return null;
  const token = await auth.getAccessToken();
  return typeof token === "string" ? token : token?.token ?? null;
}

/** Extrae los JSON de cada parte de la respuesta multipart/mixed. */
export function parseBatchResponseBodies(body: string, boundary: string): unknown[] {
  const results: unknown[] = [];
  for (const part of body.split(`--${boundary}`)) {
    const start = part.indexOf("{");
    if (start < 0) continue;
    const end = part.lastIndexOf("}");
    if (end <= start) continue;
    try {
      results.push(JSON.parse(part.slice(start, end + 1)));
    } catch {
      /* parte no-JSON (headers sueltos): ignorar */
    }
  }
  return results;
}

/**
 * Baja mensajes por lotes. Devuelve un Map id→mensaje con los que llegaron OK
 * (los 404/errores individuales simplemente no aparecen en el Map).
 * Lanza solo si NINGÚN lote pudo ejecutarse (p.ej. sin token).
 */
export async function batchGetGmailMessages(params: {
  gmail: gmail_v1.Gmail;
  /** Key del token-bucket (id de la casilla) — el batch también cuenta cuota. */
  accountKey: string;
  ids: string[];
  format?: "full" | "metadata" | "minimal";
  deadline?: number;
}): Promise<Map<string, gmail_v1.Schema$Message>> {
  const { gmail } = params;
  const format = params.format ?? "full";
  const result = new Map<string, gmail_v1.Schema$Message>();
  const ids = Array.from(new Set(params.ids.filter(Boolean)));
  if (ids.length === 0) return result;

  const token = await accessTokenOf(gmail);
  if (!token) throw new Error("batchGetGmailMessages: sin access token");

  let anyBatchOk = false;
  for (const group of chunk(ids, BATCH_CHUNK)) {
    if (params.deadline && Date.now() >= params.deadline) break;
    const boundary = `batch_opai_${Math.random().toString(36).slice(2)}`;
    const body = `${group
      .map(
        (id, index) =>
          `--${boundary}\r\n` +
          `Content-Type: application/http\r\n` +
          `Content-ID: <item-${index}>\r\n\r\n` +
          `GET /gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=${format} HTTP/1.1\r\n\r\n`,
      )
      .join("")}--${boundary}--\r\n`;

    // Un batch de 40 gets consume cuota como tal: reserva y reintenta vía adapter.
    const response = await runWithGmailQuota(params.accountKey, async () => {
      const res = await fetch(BATCH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/mixed; boundary=${boundary}`,
        },
        body,
      });
      if (res.status === 429 || res.status >= 500) {
        const error = new Error(`Gmail batch respondió ${res.status}`) as Error & {
          status?: number;
          response?: { status: number; headers: Record<string, string | null> };
        };
        error.status = res.status;
        error.response = {
          status: res.status,
          headers: { "retry-after": res.headers.get("retry-after") },
        };
        throw error;
      }
      return res;
    });
    if (!response.ok) {
      // Deja que el caller degrade al fetch por mensaje.
      throw new Error(`Gmail batch respondió ${response.status}`);
    }
    anyBatchOk = true;
    const contentType = response.headers.get("content-type") ?? "";
    const respBoundary = /boundary=([^;]+)/.exec(contentType)?.[1]?.trim();
    const text = await response.text();
    for (const parsed of parseBatchResponseBodies(text, respBoundary ?? boundary)) {
      const message = parsed as gmail_v1.Schema$Message & { error?: unknown };
      if (message && typeof message.id === "string" && !message.error) {
        result.set(message.id, message);
      }
    }
  }
  if (!anyBatchOk && ids.length > 0) {
    throw new Error("Gmail batch: ningún lote ejecutado");
  }
  return result;
}
