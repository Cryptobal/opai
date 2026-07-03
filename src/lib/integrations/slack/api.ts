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

/**
 * Errores de Slack que NO se resuelven reintentando el mismo mensaje
 * (permisos de publicación del canal, canal archivado/inexistente, bot fuera
 * de un canal privado, payload inválido, auth revocada). El outbox los marca
 * FAILED de inmediato sin gastar reintentos.
 */
const PERMANENT_SLACK_ERRORS = new Set([
  "is_archived",
  "restricted_action",
  "channel_not_found",
  "not_in_channel",
  "msg_too_long",
  "invalid_blocks",
  "invalid_arguments",
  "invalid_auth",
  "account_inactive",
  "token_revoked",
]);

export function isPermanentSlackError(code: string): boolean {
  return PERMANENT_SLACK_ERRORS.has(code);
}

/**
 * Serializa args como form-urlencoded: es el ÚNICO formato que aceptan TODOS
 * los métodos de la Web API. JSON sólo funciona en métodos de escritura
 * whitelisted (chat.postMessage); los de lectura (conversations.list) lo
 * IGNORAN en silencio y aplican defaults (verificado con api.test: JSON →
 * args {}, form → args parseados). Objetos/arrays (ej. blocks) van
 * JSON-stringified dentro del campo, patrón oficial de Slack.
 */
function toForm(body: Record<string, unknown>): string {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    form.set(k, typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return form.toString();
}

export async function callSlack(
  method: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<SlackResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers,
    body: toForm(body),
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
  msg: {
    channel: string;
    text: string;
    blocks?: unknown[];
    thread_ts?: string;
    /** Identidad por mensaje (requiere scope chat:write.customize). */
    username?: string;
    icon_url?: string;
  },
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

/**
 * Responde a un `response_url` de Slack (slash commands / interactividad).
 * No usa Bearer token: la URL ya está firmada por Slack y vence en 30 min.
 */
export async function slackRespondUrl(
  responseUrl: string,
  body: { text?: string; blocks?: unknown[]; response_type?: "ephemeral" | "in_channel"; replace_original?: boolean },
): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function slackAuthTest(token: string): Promise<{ teamId: string; userId: string }> {
  const json = await callSlack("auth.test", {}, token);
  return { teamId: (json.team_id as string) ?? "", userId: (json.user_id as string) ?? "" };
}

/**
 * views.open — abre un modal. El `trigger_id` vence en ~3s, así que hay que
 * llamar esto ANTES de cualquier trabajo pesado (Fase 5).
 */
export async function slackOpenView(
  token: string,
  triggerId: string,
  view: unknown,
): Promise<{ id: string }> {
  const json = await callSlack("views.open", { trigger_id: triggerId, view }, token);
  return { id: ((json.view as { id?: string })?.id) ?? "" };
}

/** views.update — reemplaza el contenido de un modal ya abierto. */
export async function slackUpdateView(
  token: string,
  viewId: string,
  view: unknown,
): Promise<{ id: string }> {
  const json = await callSlack("views.update", { view_id: viewId, view }, token);
  return { id: ((json.view as { id?: string })?.id) ?? "" };
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
    const list = (json.channels as Array<{ id: string; name: string; is_private?: boolean; is_archived?: boolean }>) ?? [];
    for (const c of list) {
      if (c.is_archived) continue; // defensivo: nunca ofrecer canales archivados
      channels.push({ id: c.id, name: c.name, isPrivate: !!c.is_private });
    }
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

// ── Perfil de usuario para el puente de canales (Fase 4) ──

export interface SlackUserProfile {
  displayName: string;
  avatarUrl: string | null;
}

// Caché en memoria 10 min por (teamId, userId) — evita golpear users.info por mensaje.
const PROFILE_TTL_MS = 10 * 60 * 1000;
const profileCache = new Map<string, { value: SlackUserProfile; expiresAt: number }>();

/**
 * users.info → nombre visible + avatar de un usuario de Slack, para pintar sus
 * mensajes en el chat de OPAI cuando no está vinculado a un Admin.
 */
export async function slackGetUserProfile(
  token: string,
  userId: string,
  teamId = "",
): Promise<SlackUserProfile | null> {
  const cacheKey = `${teamId}:${userId}`;
  const cached = profileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const json = await callSlack("users.info", { user: userId }, token);
  const profile = (json.user as { profile?: { display_name?: string; real_name?: string; image_192?: string } })?.profile;
  if (!profile) return null;
  const value: SlackUserProfile = {
    displayName: profile.display_name || profile.real_name || "Usuario de Slack",
    avatarUrl: profile.image_192 || null,
  };
  profileCache.set(cacheKey, { value, expiresAt: Date.now() + PROFILE_TTL_MS });
  return value;
}

export interface SlackChannelInfo {
  name: string;
  isMember: boolean;
  isPrivate: boolean;
}

/** conversations.info → nombre + si el bot es miembro + si es privado. */
export async function slackChannelInfo(token: string, channelId: string): Promise<SlackChannelInfo | null> {
  try {
    const json = await callSlack("conversations.info", { channel: channelId }, token);
    const ch = (json.channel as { name?: string; is_member?: boolean; is_private?: boolean }) ?? {};
    return {
      name: ch.name ?? "",
      isMember: !!ch.is_member,
      isPrivate: !!ch.is_private,
    };
  } catch (err) {
    if (err instanceof SlackApiError && err.slackError === "channel_not_found") return null;
    throw err;
  }
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
