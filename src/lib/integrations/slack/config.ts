/**
 * Constantes compartidas de la integración Slack.
 *
 * Los scopes deben coincidir con el manifest de la Slack App. El redirect_uri
 * se centraliza aquí para que `oauth/start` (authorize) y `oauth/callback`
 * (token exchange) usen exactamente el mismo valor — Slack los compara.
 */

import { getCanonicalSiteUrl } from "@/lib/emails/site-url";

/**
 * Bot scopes. DEBEN coincidir con el manifest de la Slack App: es lo que el
 * OAuth solicita y por ende lo que el token termina teniendo. Si se agrega
 * un scope aquí o en el manifest, cada workspace debe RECONECTAR para
 * re-autorizar (Slack no otorga scopes retroactivamente).
 * F1: envío/canales/lookup · F2: DMs del bot · F4: puente (identidad por
 * mensaje + lectura de mensajes de canales).
 */
export const SLACK_BOT_SCOPES = [
  "chat:write",
  "chat:write.public",
  "chat:write.customize",
  "channels:read",
  "channels:history",
  "groups:read",
  "groups:history",
  "im:history",
  "im:write",
  "users:read",
  "users:read.email",
  "app_mentions:read",
  "commands",
  "team:read",
].join(",");

export function slackRedirectUri(): string {
  return `${getCanonicalSiteUrl()}/api/integrations/slack/oauth/callback`;
}

export function slackAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID ?? "",
    scope: SLACK_BOT_SCOPES,
    redirect_uri: slackRedirectUri(),
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}
