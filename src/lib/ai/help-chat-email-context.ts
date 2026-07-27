import type { HelpChatPageContext } from "@/lib/ai/help-chat-page-context";

/**
 * Resuelve el threadId de correo para tools del help-chat:
 * 1) argumento explícito, 2) page context `crm_email_thread`.
 */
export function resolveEmailThreadId(
  args: Record<string, unknown>,
  pageContext: HelpChatPageContext | null,
): string {
  const fromArgs = typeof args.threadId === "string" ? args.threadId.trim() : "";
  if (fromArgs) return fromArgs;
  if (pageContext?.entityType === "crm_email_thread" && pageContext.entityId) {
    return pageContext.entityId.trim();
  }
  return "";
}

/** HTML → texto plano acotado para inyección al LLM (contenido untrusted). */
export function stripHtmlForAi(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
