import { prisma } from "@/lib/prisma";
import { getDealEmailScope, buildDealThreadWhere } from "@/modules/crm/email/deal-thread-scope";

/** Contexto de solo lectura para tool IA / resumen de licitación. */
export async function getDealCommunications(tenantId: string, dealId: string) {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { id: true, title: true },
  });
  if (!deal) return null;

  // Criterio ampliado: correos del deal + correos de la cuenta (aunque el thread
  // no esté atado al deal) → la IA tiene contexto igual.
  const scope = (await getDealEmailScope(tenantId, dealId)) ?? {
    accountId: null,
    contactIds: [],
  };
  const threadWhere = buildDealThreadWhere(tenantId, dealId, scope);

  const [threads, quotes, notes] = await Promise.all([
    prisma.crmEmailThread.findMany({
      where: threadWhere,
      orderBy: { lastMessageAt: "desc" },
      take: 10,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            sentAt: true,
            receivedAt: true,
            fromEmail: true,
            subject: true,
            textBody: true,
            direction: true,
          },
        },
      },
    }),
    prisma.crmDealQuote.findMany({
      where: { tenantId, dealId },
      select: { quoteId: true },
      take: 20,
    }),
    prisma.note.findMany({
      where: { tenantId, contextType: "DEAL", contextId: dealId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { content: true, createdAt: true, authorId: true },
    }).catch(() => []),
  ]);

  const quoteIds = quotes.map((q) => q.quoteId);
  const cpqQuotes = quoteIds.length
    ? await prisma.cpqQuote.findMany({
        where: { tenantId, id: { in: quoteIds } },
        select: {
          code: true,
          monthlyCost: true,
          status: true,
        },
      })
    : [];

  const emails = threads.flatMap((t) =>
    t.messages.map((m) => ({
      fecha: (m.sentAt || m.receivedAt || new Date()).toISOString(),
      de: m.fromEmail,
      asunto: m.subject,
      extracto: (m.textBody || "").slice(0, 200),
      direction: m.direction,
      // true = correo de la cuenta (no atado directamente a este deal).
      deCuenta: t.dealId !== dealId,
    })),
  );
  emails.sort((a, b) => b.fecha.localeCompare(a.fecha));

  return {
    deal,
    emails: emails.slice(0, 15),
    quotes: cpqQuotes.map((q) => ({
      codigo: q.code,
      version: null as number | null,
      monto: Number(q.monthlyCost ?? 0),
      estado: q.status,
    })),
    notes: notes.map((n) => ({
      body: (n.content || "").slice(0, 300),
      createdAt: n.createdAt.toISOString(),
    })),
  };
}
