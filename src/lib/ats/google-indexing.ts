import { google } from "googleapis";

/**
 * Google Indexing API integration for job postings.
 *
 * Required env vars:
 *   GOOGLE_INDEXING_CLIENT_EMAIL  – Service account email
 *   GOOGLE_INDEXING_PRIVATE_KEY   – Service account private key (PEM, with \n)
 *
 * Setup:
 * 1. Create a Google Cloud project
 * 2. Enable the "Web Search Indexing API"
 * 3. Create a service account with no special roles
 * 4. Download the JSON key and set the env vars above
 * 5. In Google Search Console, add the service account email as an owner
 *    of the property https://opai.cl (or the relevant domain)
 */

const SCOPES = ["https://www.googleapis.com/auth/indexing"];

/**
 * Normalise the GOOGLE_INDEXING_PRIVATE_KEY env var into a valid PEM string.
 *
 * Vercel/dotenv users hit a common set of malformations that all surface as
 * `error:1E08010C:DECODER routines::unsupported` from Node's crypto layer:
 *
 * 1. The whole key is wrapped in `"..."` because the user pasted it inside
 *    quotes in the Vercel UI.
 * 2. Newlines are stored as the literal two-character sequence `\n` (the
 *    classic case — already handled by .replace).
 * 3. Newlines are CRLF (`\r\n`) instead of LF.
 * 4. The user base64-encoded the whole PEM to avoid newline issues, expecting
 *    the app to decode it.
 * 5. Stray BOM / leading whitespace.
 *
 * This helper is intentionally defensive so a misconfigured env var doesn't
 * silently break Google Jobs indexing.
 */
function normalisePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let key = raw.trim();
  // Strip BOM
  if (key.charCodeAt(0) === 0xfeff) key = key.slice(1);
  // Strip wrapping single or double quotes
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  // Replace literal \n with real newlines
  key = key.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  // If it doesn't look like a PEM yet, try base64-decoding
  if (!key.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) key = decoded;
    } catch {
      // ignore
    }
  }
  return key;
}

function getAuth() {
  const clientEmail = process.env.GOOGLE_INDEXING_CLIENT_EMAIL?.trim();
  const privateKey = normalisePrivateKey(process.env.GOOGLE_INDEXING_PRIVATE_KEY);

  if (!clientEmail || !privateKey) {
    return null;
  }
  if (!privateKey.includes("-----BEGIN")) {
    console.error(
      "[ATS] GOOGLE_INDEXING_PRIVATE_KEY no parece un PEM válido tras normalización; revisa el env var.",
    );
    return null;
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: SCOPES,
  });
}

export async function requestGoogleIndexing(
  url: string,
  type: "URL_UPDATED" | "URL_DELETED" = "URL_UPDATED",
): Promise<{ success: boolean; error?: string }> {
  const auth = getAuth();
  if (!auth) {
    console.warn("[ATS] Google Indexing API: credenciales no configuradas, omitiendo indexación");
    return { success: true, error: "credentials_not_configured" };
  }

  try {
    const indexing = google.indexing({ version: "v3", auth });
    await indexing.urlNotifications.publish({
      requestBody: { url, type },
    });
    console.log(`[ATS] Google Indexing API: ${type} → ${url}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error(`[ATS] Google Indexing API error: ${message}`);
    return { success: false, error: message };
  }
}
