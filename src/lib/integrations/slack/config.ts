/**
 * Constantes compartidas de la integración Slack.
 *
 * Los scopes deben coincidir con el manifest de la Slack App. El redirect_uri
 * se centraliza aquí para que `oauth/start` (authorize) y `oauth/callback`
 * (token exchange) usen exactamente el mismo valor — Slack los compara.
 */

import { getCanonicalSiteUrl } from "@/lib/emails/site-url";

/** Bot scopes (Fase 1: enviar, listar canales, lookup por email, eventos). */
export const SLACK_BOT_SCOPES = [
  "chat:write",
  "chat:write.public",
  "channels:read",
  "groups:read",
  "users:read",
  "users:read.email",
  "app_mentions:read",
  "commands",
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
