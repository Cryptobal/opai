/**
 * Cliente fetch mínimo contra la Web API de Slack (https://slack.com/api/*).
 *
 * Sin dependencias npm: sólo `fetch` nativo. Toda respuesta se valida por
 * `ok === true`; si no, se lanza `SlackApiError` con el código de Slack
 * (ej. `not_in_channel`, `invalid_auth`, `channel_not_found`).
 */

import { slackRedirectUri } from "./config";

const BASE = "https://slack.com/api";

export class SlackApiError extends Error {
  constructor(public readonly slackError: string) {
    super(`[slack] Slack API error: ${slackError}`);
    this.name = "SlackApiError";
  }
}

type SlackResponse = { ok: boolean; error?: string; [k: string]: unknown };

async function callSlack(
  method: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<SlackResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as SlackResponse;
  if (!json.ok) throw new SlackApiError(json.error ?? `http_${res.status}`);
  return json;
}

// OAuth usa form-urlencoded y no Bearer token.
export async function slackOAuthAccess(code: string): Promise<{
  teamId: string;
  teamName: string;
  botUserId: string;
  accessToken: string;
  scope: string;
}> {
  const form = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID ?? "",
    client_secret: process.env.SLACK_CLIENT_SECRET ?? "",
    code,
    redirect_uri: slackRedirectUri(),
  });
  const res = await fetch(`${BASE}/oauth.v2.access`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const json = (await res.json()) as SlackResponse & {
    team?: { id?: string; name?: string };
    bot_user_id?: string;
    access_token?: string;
    scope?: string;
  };
  if (!json.ok) throw new SlackApiError(json.error ?? `http_${res.status}`);
  return {
    teamId: json.team?.id ?? "",
    teamName: json.team?.name ?? "",
    botUserId: json.bot_user_id ?? "",
    accessToken: json.access_token ?? "",
    scope: json.scope ?? "",
  };
}

export async function slackPostMessage(
  token: string,
  msg: { channel: string; text: string; blocks?: unknown[]; thread_ts?: string },
): Promise<{ ts: string }> {
  const json = await callSlack("chat.postMessage", { ...msg }, token);
  return { ts: (json.ts as string) ?? "" };
}

export async function slackUpdateMessage(
  token: string,
  msg: { channel: string; ts: string; text: string; blocks?: unknown[] },
): Promise<{ ts: string }> {
  const json = await callSlack("chat.update", { ...msg }, token);
  return { ts: (json.ts as string) ?? "" };
}

export async function slackAuthTest(token: string): Promise<{ teamId: string; userId: string }> {
  const json = await callSlack("auth.test", {}, token);
  return { teamId: (json.team_id as string) ?? "", userId: (json.user_id as string) ?? "" };
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
}

export async function slackListChannels(token: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;
  // Paginado por cursor, máx 3 páginas para no golpear rate limits.
  for (let page = 0; page < 3; page++) {
    const body: Record<string, unknown> = {
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
    };
    if (cursor) body.cursor = cursor;
    const json = await callSlack("conversations.list", body, token);
    const list = (json.channels as Array<{ id: string; name: string; is_private?: boolean }>) ?? [];
    for (const c of list) channels.push({ id: c.id, name: c.name, isPrivate: !!c.is_private });
    cursor = (json.response_metadata as { next_cursor?: string } | undefined)?.next_cursor || undefined;
    if (!cursor) break;
  }
  return channels;
}

export async function slackLookupUserByEmail(
  token: string,
  email: string,
): Promise<{ userId: string } | null> {
  try {
    const json = await callSlack("users.lookupByEmail", { email }, token);
    return { userId: ((json.user as { id?: string })?.id) ?? "" };
  } catch (err) {
    if (err instanceof SlackApiError && err.slackError === "users_not_found") return null;
    throw err;
  }
}

export interface SlackUserInfo {
  userId: string;
  email: string | null;
  realName: string | null;
  isBot: boolean;
}

/** users.info: resuelve email + nombre de un usuario Slack (para vincularlo a un Admin). */
export async function slackUserInfo(token: string, userId: string): Promise<SlackUserInfo | null> {
  try {
    const json = await callSlack("users.info", { user: userId }, token);
    const user = (json.user as {
      id?: string;
      is_bot?: boolean;
      profile?: { email?: string; real_name?: string };
    }) ?? {};
    return {
      userId: user.id ?? userId,
      email: user.profile?.email ?? null,
      realName: user.profile?.real_name ?? null,
      isBot: !!user.is_bot,
    };
  } catch (err) {
    if (err instanceof SlackApiError && err.slackError === "user_not_found") return null;
    throw err;
  }
}
