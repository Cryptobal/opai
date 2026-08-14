/**
 * Resolución negocio ↔ cotización para tools de licitación.
 * Si hay varias cotizaciones abiertas, pide elegir y persiste en metadata del hilo.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type QuoteChoice = { id: string; code: string; name: string | null; status: string };

export async function listDealQuotes(tenantId: string, dealId: string): Promise<QuoteChoice[]> {
  const quotes = await prisma.cpqQuote.findMany({
    where: { tenantId, dealId, status: { not: "rejected" } },
    select: { id: true, code: true, name: true, status: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  return quotes;
}

export async function persistSelectedQuote(opts: {
  tenantId: string;
  userId: string;
  conversationId?: string | null;
  quoteId: string;
}): Promise<void> {
  if (!opts.conversationId) return;
  const conv = await prisma.aiChatConversation.findFirst({
    where: { id: opts.conversationId, tenantId: opts.tenantId, userId: opts.userId },
    select: { metadata: true },
  });
  if (!conv) return;
  const meta =
    conv.metadata && typeof conv.metadata === "object" && !Array.isArray(conv.metadata)
      ? { ...(conv.metadata as Record<string, unknown>) }
      : {};
  meta.selectedQuoteId = opts.quoteId;
  await prisma.aiChatConversation.update({
    where: { id: opts.conversationId },
    data: { metadata: meta as Prisma.InputJsonValue },
  });
}

export async function readSelectedQuoteId(opts: {
  tenantId: string;
  userId: string;
  conversationId?: string | null;
}): Promise<string | null> {
  if (!opts.conversationId) return null;
  const conv = await prisma.aiChatConversation.findFirst({
    where: { id: opts.conversationId, tenantId: opts.tenantId, userId: opts.userId },
    select: { metadata: true },
  });
  const meta = conv?.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const id = (meta as Record<string, unknown>).selectedQuoteId;
  return typeof id === "string" && id ? id : null;
}

export async function resolveQuoteForDeal(opts: {
  tenantId: string;
  dealId: string;
  userId: string;
  conversationId?: string | null;
  quoteIdOrCode?: string;
}): Promise<
  | { ok: true; quoteId: string; code: string }
  | { ok: false; error: string; quotes?: QuoteChoice[] }
> {
  const quotes = await listDealQuotes(opts.tenantId, opts.dealId);
  if (quotes.length === 0) {
    return {
      ok: false,
      error:
        "Este negocio no tiene cotización. Creá una cotización CPQ en la ficha del negocio para operar la propuesta.",
    };
  }

  if (opts.quoteIdOrCode?.trim()) {
    const ref = opts.quoteIdOrCode.trim();
    const hit = quotes.find((q) => q.id === ref || q.code === ref);
    if (!hit) return { ok: false, error: `No encontré la cotización ${ref} en este negocio.`, quotes };
    await persistSelectedQuote({
      tenantId: opts.tenantId,
      userId: opts.userId,
      conversationId: opts.conversationId,
      quoteId: hit.id,
    });
    return { ok: true, quoteId: hit.id, code: hit.code };
  }

  const stored = await readSelectedQuoteId(opts);
  if (stored) {
    const hit = quotes.find((q) => q.id === stored);
    if (hit) return { ok: true, quoteId: hit.id, code: hit.code };
  }

  if (quotes.length === 1) {
    await persistSelectedQuote({
      tenantId: opts.tenantId,
      userId: opts.userId,
      conversationId: opts.conversationId,
      quoteId: quotes[0].id,
    });
    return { ok: true, quoteId: quotes[0].id, code: quotes[0].code };
  }

  return {
    ok: false,
    error: "Hay varias cotizaciones. Indicá el código (ej. CPQ-2026-001) para continuar.",
    quotes,
  };
}
