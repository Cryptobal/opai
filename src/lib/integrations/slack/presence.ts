/**
 * Presencia total + lectura de contexto bajo demanda (Fase 15, B8) — el modo
 * "Claude Code": OPAI se une a todos los canales públicos y puede leer las
 * últimas N del historial de un canal para resumir/responder, SIN persistir nada
 * (decisión de privacidad v1: la ingesta permanente queda fuera de alcance).
 */

import { getWorkspaceForTenant } from "./workspace";
import { isChannelExcluded } from "./channel-exclusions";
import {
  slackListPublicChannels,
  slackConversationsJoin,
  slackConversationsHistory,
  slackChannelInfo,
  slackGetUserProfile,
} from "./api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Une el bot a TODOS los canales públicos del workspace. Respeta el rate-limit
 * (pausa cada 20 joins si hay muchos). Los privados requieren invitación manual.
 */
export async function joinAllPublicChannels(tenantId: string): Promise<{ joined: number; already: number; failed: number; total: number }> {
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return { joined: 0, already: 0, failed: 0, total: 0 };
  const channels = await slackListPublicChannels(ws.botToken);
  let joined = 0, already = 0, failed = 0;
  for (let i = 0; i < channels.length; i++) {
    try {
      const r = await slackConversationsJoin(ws.botToken, channels[i].id);
      if (!r.ok) failed++;
      else if (r.already) already++;
      else joined++;
    } catch {
      failed++;
    }
    // Tier 3 (~50/min): pausa breve cada 20 para no golpear el límite en workspaces grandes.
    if (channels.length > 50 && (i + 1) % 20 === 0) await sleep(1500);
  }
  return { joined, already, failed, total: channels.length };
}

/** Auto-join de un canal recién creado (evento channel_created). Best-effort. */
export async function autoJoinNewChannel(tenantId: string, channelId: string): Promise<void> {
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws || !channelId) return;
  await slackConversationsJoin(ws.botToken, channelId).catch((e) => console.error("[slack] auto-join channel_created falló:", e));
}

/** Resuelve un canal por nombre (#canal) o id; null si no existe entre los públicos. */
async function resolveChannelId(botToken: string, ref: string): Promise<{ id: string; name: string } | null> {
  const clean = ref.trim().replace(/^#/, "").toLowerCase();
  if (/^C[A-Z0-9]{6,}$/.test(ref.trim())) {
    const info = await slackChannelInfo(botToken, ref.trim());
    return info ? { id: ref.trim(), name: info.name } : { id: ref.trim(), name: clean };
  }
  const channels = await slackListPublicChannels(botToken);
  const match = channels.find((c) => c.name.toLowerCase() === clean) ?? channels.find((c) => c.name.toLowerCase().includes(clean));
  return match ? { id: match.id, name: match.name } : null;
}

/**
 * Tool del bot `slack_channel_context`: lee las últimas ~50 de un canal y las
 * entrega como contexto al runner (sin guardar nada). Si el bot no es miembro,
 * devuelve una respuesta accionable para que lo inviten.
 */
export async function readChannelContextForTool(
  tenantId: string,
  args: { channel?: string; currentChannelId?: string; limit?: number },
): Promise<{ ok: boolean; error?: string; data?: { channel: string; messages: Array<{ author: string; text: string }> } }> {
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return { ok: false, error: "Slack no está conectado para tu organización." };

  const ref = (args.channel ?? "").trim();
  let channelId: string | null = null;
  let channelName = ref.replace(/^#/, "");
  if (!ref && args.currentChannelId) {
    channelId = args.currentChannelId;
    const info = await slackChannelInfo(ws.botToken, channelId).catch(() => null);
    channelName = info?.name ?? "este canal";
  } else if (ref) {
    const resolved = await resolveChannelId(ws.botToken, ref);
    if (!resolved) return { ok: false, error: `No encontré el canal "${ref}" entre los públicos.` };
    channelId = resolved.id;
    channelName = resolved.name;
  }
  if (!channelId) return { ok: false, error: "Indica el canal (ej. #reportes) o menciona el actual." };

  // Gobernanza (Fase 16, B6): OPAI NUNCA lee un canal excluido por el tenant.
  if (await isChannelExcluded(tenantId, channelId)) {
    return { ok: false, error: `El canal #${channelName} está en la lista de canales que no puedo leer (configuración de OPAI).` };
  }

  const info = await slackChannelInfo(ws.botToken, channelId).catch(() => null);
  if (info && !info.isMember) {
    return { ok: false, error: `No soy miembro de #${channelName}. Invítame con \`/invite @OPAI\` en ese canal y vuelve a pedírmelo.` };
  }

  let history;
  try {
    history = await slackConversationsHistory(ws.botToken, channelId, Math.min(Math.max(args.limit ?? 50, 5), 100));
  } catch (err) {
    const code = (err as { slackError?: string })?.slackError;
    if (code === "not_in_channel") return { ok: false, error: `No soy miembro de #${channelName}. Invítame con \`/invite @OPAI\`.` };
    return { ok: false, error: `No pude leer #${channelName}.` };
  }

  // Resuelve nombres visibles (cacheado); mensajes de bot van como "OPAI/bot".
  const names = new Map<string, string>();
  const uniqueUsers = [...new Set(history.map((m) => m.user).filter((u): u is string => !!u))].slice(0, 40);
  await Promise.all(uniqueUsers.map(async (u) => {
    const p = await slackGetUserProfile(ws.botToken, u).catch(() => null);
    names.set(u, p?.displayName ?? u);
  }));

  const messages = history
    .slice()
    .reverse() // conversations.history viene más-reciente-primero; entregamos cronológico
    .map((m) => ({ author: m.user ? names.get(m.user) ?? m.user : m.botId ? "bot" : "sistema", text: m.text }))
    .filter((m) => m.text.trim().length > 0);

  return { ok: true, data: { channel: channelName, messages } };
}
