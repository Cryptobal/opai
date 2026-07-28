import { prisma } from "@/lib/prisma";

export type DealSuggestion = {
  title: string;
  amount: number | null;
  stageId: string | null;
  stageName: string | null;
  reason: string;
};

/** Quita prefijos RE:/FW:/RV: del asunto. */
function cleanSubject(raw: string): string {
  let s = raw.trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(/^\s*(re|rv|fw|fwd)\s*:\s*/i, "").trim();
  } while (s !== prev);
  return s.slice(0, 200);
}

/**
 * Propone campos de negocio a partir del hilo (asunto + resumen IA + primera
 * etapa del pipeline). Heurística barata; el usuario confirma el alta.
 */
export async function suggestDealForThread(
  tenantId: string,
  threadId: string,
): Promise<DealSuggestion | null> {
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId },
    select: {
      subject: true,
      accountId: true,
      aiSummary: true,
    },
  });
  if (!thread?.accountId) return null;

  const stage = await prisma.crmPipelineStage.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });

  const title = cleanSubject(thread.subject || "") || "Nuevo negocio";

  // Monto: busca un número con $ o UF en el resumen IA (si existe).
  let amount: number | null = null;
  const summary = thread.aiSummary ?? "";
  const moneyMatch =
    summary.match(/(?:UF|CLP|\$)\s*([\d.]+(?:,\d+)?)/i) ||
    summary.match(/([\d.]+(?:,\d+)?)\s*(?:UF|CLP)/i);
  if (moneyMatch?.[1]) {
    const n = Number(moneyMatch[1].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) amount = n;
  }

  return {
    title,
    amount,
    stageId: stage?.id ?? null,
    stageName: stage?.name ?? null,
    reason: thread.aiSummary
      ? "Propuesto a partir del asunto y el resumen del hilo"
      : "Propuesto a partir del asunto del hilo",
  };
}
