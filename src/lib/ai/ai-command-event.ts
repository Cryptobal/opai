/** Evento para abrir el asistente con prompt (y opcionalmente auto-enviar). */
export const AI_COMMAND_EVENT = "opai-ai-command";

export type AiCommandDetail = {
  prompt: string;
  autoSend?: boolean;
};

export function dispatchAiCommand(detail: AiCommandDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AI_COMMAND_EVENT, { detail }));
}
