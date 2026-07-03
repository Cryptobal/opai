/**
 * OPAI como agente nativo en el panel de IA de Slack (agent_view, Fase 7.1).
 *
 * `assistant_thread_started`: saludo breve + prompts sugeridos (cumplen el rol
 * del mensaje de bienvenida en esta superficie). `assistant_thread_context_changed`:
 * guarda el canal activo del usuario para responder situado cuando mira un canal
 * puenteado. Los mensajes del hilo de agente llegan como `message` (im) y los
 * atiende el bot conversacional de siempre.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "./workspace";
import { assistantSetSuggestedPrompts, slackPostMessage } from "./api";

interface AssistantThread {
  channel_id?: string;
  thread_ts?: string;
  user_id?: string;
  context?: { channel_id?: string | null };
}
export interface AssistantEvent {
  assistant_thread?: AssistantThread;
}

const SUGGESTED_PROMPTS = [
  { title: "Mis tickets por prioridad", message: "Muéstrame mis tickets abiertos ordenados por prioridad" },
  { title: "¿Cómo viene la caja del mes?", message: "Dame un resumen ejecutivo de la caja actual y la proyección del mes" },
  { title: "Tickets vencidos de SLA", message: "¿Qué tickets míos tienen el SLA vencido?" },
  { title: "Crear un lead", message: "Quiero crear un lead nuevo" },
];

/** Saludo + prompts sugeridos al abrir el hilo del agente OPAI. */
export async function handleAssistantThreadStarted(tenantId: string, event: AssistantEvent): Promise<void> {
  const th = event.assistant_thread;
  if (!th?.channel_id || !th?.thread_ts) return;
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return;

  await slackPostMessage(ws.botToken, {
    channel: th.channel_id,
    thread_ts: th.thread_ts,
    text: "Soy OPAI, tu copiloto de operaciones. Pregúntame por tickets, caja, cotizaciones o pídeme crear algo. Elige un atajo o escríbeme; `/opai ayuda` lista todo.",
  }).catch(() => {});
  await assistantSetSuggestedPrompts(ws.botToken, th.channel_id, th.thread_ts, SUGGESTED_PROMPTS).catch(() => {});
}

/** Guarda el canal activo del usuario en el panel (para respuestas situadas). */
export async function handleAssistantContextChanged(tenantId: string, event: AssistantEvent): Promise<void> {
  const th = event.assistant_thread;
  const userId = th?.user_id;
  if (!userId) return;
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return;
  await prisma.slackUserLink.updateMany({
    where: { workspaceId: ws.id, slackUserId: userId },
    data: { activeChannelId: th?.context?.channel_id ?? null },
  });
}
