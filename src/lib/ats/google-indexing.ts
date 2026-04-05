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

function getAuth() {
  const clientEmail = process.env.GOOGLE_INDEXING_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_INDEXING_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );

  if (!clientEmail || !privateKey) {
    return null;
  }

  return new google.auth.JWT(clientEmail, undefined, privateKey, SCOPES);
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
