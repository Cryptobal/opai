/** Resuelve cotización CPQ desde código/nombre/contexto página para tools del asistente IA. */

import type { HelpChatPageContext } from "@/lib/ai/help-chat-page-context";
import { prisma } from "@/lib/prisma";
import { resolveQuoteByCodeOrName } from "@/lib/ai/help-chat-resolvers";

type PageCx = HelpChatPageContext | null | undefined;

export async function resolveAiHelpChatCpqQuote(
  tenantId: string,
  quoteIdOrCode: string | undefined,
  pageContext: PageCx,
): Promise<{ id: string; code: string | null }> {
  let ref = typeof quoteIdOrCode === "string" ? quoteIdOrCode.trim() : "";
  if (!ref && pageContext?.entityType === "cpq_quote" && pageContext.entityId) {
    ref = pageContext.entityId;
  }
  if (!ref) throw new Error("QUOTE_REF_MISSING");

  const resolved = await resolveQuoteByCodeOrName(tenantId, ref);
  if (!resolved) throw new Error("QUOTE_NOT_FOUND");

  const full = await prisma.cpqQuote.findFirst({
    where: { id: resolved.id, tenantId },
    select: { id: true, code: true },
  });
  if (!full) throw new Error("QUOTE_NOT_FOUND");
  return full;
}
