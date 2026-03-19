/**
 * Inserta en una cotización los ítems "Incluye" marcados como default en cpqIncludesSuggestion.
 * Idempotente: no hace nada si la cotización ya tiene filas en quote_includes_items.
 */

import type { PrismaClient } from "@prisma/client";

type CpqIncludesDelegate = Pick<
  PrismaClient,
  "cpqIncludesSuggestion" | "cpqQuoteIncludesItem" | "cpqQuote"
>;

export async function applyDefaultQuoteIncludes(
  db: CpqIncludesDelegate,
  quoteId: string,
  tenantId: string,
): Promise<void> {
  const existing = await db.cpqQuoteIncludesItem.count({ where: { quoteId } });
  if (existing > 0) return;

  const defaultSuggestions = await db.cpqIncludesSuggestion.findMany({
    where: {
      isDefault: true,
      isActive: true,
      OR: [{ tenantId: null }, { tenantId }],
    },
    orderBy: { sortOrder: "asc" },
  });

  if (defaultSuggestions.length === 0) return;

  await db.cpqQuoteIncludesItem.createMany({
    data: defaultSuggestions.map((s, idx) => ({
      quoteId,
      text: s.text,
      sortOrder: idx,
      showInPdf: true,
      source: "suggestion",
      suggestionId: s.id,
    })),
  });

  await db.cpqQuote.update({
    where: { id: quoteId },
    data: {
      includedItems: defaultSuggestions.map((s) => s.text),
    },
  });
}
