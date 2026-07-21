import { google } from "googleapis";

/** modify incluye read/labels; send se mantiene aparte. */
export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export const GMAIL_SCOPES = [GMAIL_SEND_SCOPE, GMAIL_MODIFY_SCOPE];

export function hasGmailModify(grantedScopes: string | null | undefined): boolean {
  if (!grantedScopes) return false;
  return grantedScopes.split(/[\s,]+/).includes(GMAIL_MODIFY_SCOPE);
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

export function getGmailClient(accessToken: string, refreshToken?: string) {
  const client = getGmailOAuthClient();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return google.gmail({ version: "v1", auth: client });
}
