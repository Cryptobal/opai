/**
 * Helpers puros compartidos entre el transporte SSE (stream route del chat web)
 * y el runner no-streaming (`help-chat-runner.ts`, usado por Slack). Extraídos
 * SIN cambiar su comportamiento para evitar duplicar strings/lógica.
 */

import { chooseModel } from "@/lib/ai/help-chat-model-router";
import type { HelpChatAIConfig } from "@/lib/ai/help-chat-provider";

/** Presupuesto de caracteres del historial antes de recortar los turnos más viejos. */
export const MAX_HISTORY_CHARS = 12_000;

export function fallbackMessage(): string {
  return `No tengo datos específicos para responder eso con certeza. ¿Puedes darme más contexto o reformular tu pregunta?`;
}

export function toAbsoluteUrl(pathname: string, appBaseUrl: string): string {
  if (!pathname.startsWith("/")) return pathname;
  const base = appBaseUrl.endsWith("/") ? appBaseUrl.slice(0, -1) : appBaseUrl;
  return `${base}${pathname}`;
}

export function normalizeAssistantLinks(text: string, appBaseUrl: string): string {
  let output = text;
  output = output.replace(
    /-\s*URL:\s*`(\/[^`]+)`/gi,
    (_, path: string) => `- Ingresa acá: [Abrir enlace](${toAbsoluteUrl(path, appBaseUrl)})`,
  );
  output = output.replace(
    /\[([^\]]+)\]\((\/[^)\s]+)\)/g,
    (_, label: string, path: string) => `[${label}](${toAbsoluteUrl(path, appBaseUrl)})`,
  );
  output = output.replace(
    /`(\/[a-z0-9\-/_[\]]+)`/gi,
    (_, path: string) => `[Ingresa acá](${toAbsoluteUrl(path, appBaseUrl)})`,
  );
  output = output.replace(
    /\((\/[a-z0-9\-/_[\]]+)\)/gi,
    (_, path: string) => `(Ingresa acá: [Abrir enlace](${toAbsoluteUrl(path, appBaseUrl)}))`,
  );
  return output;
}

/**
 * Recorta el historial descartando los turnos más antiguos (de a pares
 * user/assistant) hasta caber en `MAX_HISTORY_CHARS`. Nunca baja de 2 mensajes.
 */
export function trimHistory<T extends { content: string }>(history: T[]): T[] {
  let trimmed = [...history];
  let size = trimmed.reduce((sum, m) => sum + m.content.length, 0);
  while (size > MAX_HISTORY_CHARS && trimmed.length > 2) {
    trimmed = trimmed.slice(2);
    size = trimmed.reduce((sum, m) => sum + m.content.length, 0);
  }
  return trimmed;
}

/**
 * Resuelve el modelo efectivo. Para proveedores configurados en plataforma se
 * honra el modelo elegido; para el fallback por env-var (OpenAI) se aplica el
 * router dinámico según calidad de retrieval / estado de conversación.
 */
export function resolveEffectiveModel(
  aiConfig: HelpChatAIConfig,
  ctx: { retrievalMaxScore: number; recentFallbackCount: number; frustrated: boolean },
): string {
  if (aiConfig.source === "platform") return aiConfig.model;
  return chooseModel(ctx);
}
