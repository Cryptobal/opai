import { prisma } from "@/lib/prisma";
import type { CorreoThreadDTO } from "./correos.types";

const KEYWORDS = ["cotiz", "licitac", "servicio", "propuesta", "bases", "presupuesto"];

/** Lista paginada (cursor por fecha) de hilos de la casilla del usuario. */
export async function listCorreoThreads(params: {
  tenantId: string;
  emailAccountId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<{ items: CorreoThreadDTO[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  const cursorDate = params.cursor ? new Date(params.cursor) : null;
  const rows = await prisma.crmEmailThread.findMany({
    where: {
      tenantId: params.tenantId,
      emailAccountId: params.emailAccountId,
      ...(cursorDate && !Number.isNaN(cursorDate.getTime())
        ? { lastMessageAt: { lt: cursorDate } }
        : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: limit + 1,
    select: {
      id: true,
      subject: true,
      accountId: true,
      dealId: true,
      leadId: true,
      lastMessageAt: true,
      providerThreadId: true,
      attachmentCount: true,
      messages: { select: { fromEmail: true, textBody: true }, orderBy: { sentAt: "desc" }, take: 1 },
      _count: { select: { messages: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const accountIds = Array.from(new Set(page.map((r) => r.accountId).filter(Boolean) as string[]));
  const dealIds = Array.from(new Set(page.map((r) => r.dealId).filter(Boolean) as string[]));
  const [accounts, deals] = await Promise.all([
    accountIds.length
      ? prisma.crmAccount.findMany({ where: { tenantId: params.tenantId, id: { in: accountIds } }, select: { id: true, name: true } })
      : [],
    dealIds.length
      ? prisma.crmDeal.findMany({ where: { tenantId: params.tenantId, id: { in: dealIds } }, select: { id: true, title: true } })
      : [],
  ]);
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));
  const dealMap = new Map(deals.map((d) => [d.id, d.title]));

  const items: CorreoThreadDTO[] = page.map((r) => {
    const kw = KEYWORDS.some((k) => r.subject.toLowerCase().includes(k));
    return {
      id: r.id,
      subject: r.subject,
      fromEmail: r.messages[0]?.fromEmail ?? null,
      snippet: r.messages[0]?.textBody?.replace(/\s+/g, " ").trim().slice(0, 140) ?? null,
      lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
      accountId: r.accountId,
      accountName: r.accountId ? accMap.get(r.accountId) ?? null : null,
      dealId: r.dealId,
      dealTitle: r.dealId ? dealMap.get(r.dealId) ?? null : null,
      leadId: r.leadId,
      attachmentCount: r.attachmentCount,
      messageCount: r._count.messages,
      providerThreadId: r.providerThreadId,
      possibleLead: !r.accountId && !r.leadId && (r.attachmentCount > 0 || kw),
    };
  });

  const nextCursor = hasMore ? page[page.length - 1].lastMessageAt?.toISOString() ?? null : null;
  return { items, nextCursor };
}
