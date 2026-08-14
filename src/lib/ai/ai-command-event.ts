/** Evento para abrir el asistente con prompt (y opcionalmente auto-enviar). */
export const AI_COMMAND_EVENT = "opai-ai-command";
export const AI_OPEN_ANCHORED_EVENT = "opai-ai-open-anchored";

export type AiCommandDetail = {
  prompt: string;
  autoSend?: boolean;
};

export type AiOpenAnchoredDetail = {
  anchorType: "crm_deal" | "crm_account" | "cpq_quote" | "crm_lead";
  anchorId: string;
  entityName: string;
  createNew?: boolean;
};

export function dispatchAiCommand(detail: AiCommandDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AI_COMMAND_EVENT, { detail }));
}

export function openAnchoredChat(detail: AiOpenAnchoredDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AI_OPEN_ANCHORED_EVENT, { detail }));
}
