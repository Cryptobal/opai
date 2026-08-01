import { google } from "googleapis";

/** modify incluye read/labels; send se mantiene aparte. */
export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
/** People API: contactos guardados (fotos de remitentes conocidos). */
export const PEOPLE_CONTACTS_SCOPE =
  "https://www.googleapis.com/auth/contacts.readonly";
/** People API: "Other contacts" (remitentes frecuentes sin guardar). */
export const PEOPLE_OTHER_CONTACTS_SCOPE =
  "https://www.googleapis.com/auth/contacts.other.readonly";

export const GMAIL_SCOPES = [
  GMAIL_SEND_SCOPE,
  GMAIL_MODIFY_SCOPE,
  PEOPLE_CONTACTS_SCOPE,
  PEOPLE_OTHER_CONTACTS_SCOPE,
];

export type GmailRefreshedTokens = {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string;
};

function splitScopes(grantedScopes: string | null | undefined): string[] {
  if (!grantedScopes) return [];
  return grantedScopes.split(/[\s,]+/).filter(Boolean);
}

export function hasGmailModify(grantedScopes: string | null | undefined): boolean {
  return splitScopes(grantedScopes).includes(GMAIL_MODIFY_SCOPE);
}

/** True si la casilla ya autorizó al menos un scope de People para fotos. */
export function hasPeopleContactsScope(
  grantedScopes: string | null | undefined,
): boolean {
  const scopes = splitScopes(grantedScopes);
  return (
    scopes.includes(PEOPLE_CONTACTS_SCOPE) ||
    scopes.includes(PEOPLE_OTHER_CONTACTS_SCOPE)
  );
}

export function getGmailOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Faltan variables de entorno de Gmail OAuth");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGmailClient(
  accessToken: string,
  refreshToken?: string,
  onTokens?: (tokens: GmailRefreshedTokens) => void | Promise<void>,
) {
  const client = getGmailOAuthClient();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (onTokens) {
    client.on("tokens", (tokens) => {
      void Promise.resolve(onTokens(tokens)).catch((error) => {
        console.warn("[gmail] no se pudo persistir el token refrescado", error);
      });
    });
  }
  return google.gmail({ version: "v1", auth: client });
}
