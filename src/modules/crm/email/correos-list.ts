import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import type { CorreoThreadDTO } from "./correos.types";
import {
  domainOf,
  isPublicMailDomain,
  isSystemSender,
  snippetFromBody,
} from "./correos-list-helpers";

const KEYWORDS = ["cotiz", "licitac", "servicio", "propuesta", "bases", "presupuesto"];

export type CorreoListFilter = "inbox" | "archived" | "all" | "trash" | "snoozed";

/**
 * Spam excluido de todo menos papelera (que solo mira trashedAt), como Gmail.
 * Recibidos excluye los pospuestos vigentes (`snoozedUntil > now`); Pospuestos
 * es su propia carpeta.
 */
function folderWhere(folder: CorreoListFilter) {
  const now = new Date();
  if (folder === "trash") return { trashedAt: { not: null } };
  if (folder === "snoozed") return { trashedAt: null, spamAt: null, snoozedUntil: { gt: now } };
  if (folder === "archived") return { trashedAt: null, spamAt: null, archivedAt: { not: null } };
  if (folder === "all") return { trashedAt: null, spamAt: null };
  return { trashedAt: null, spamAt: null, archivedAt: null, NOT: { snoozedUntil: { gt: now } } };
}

/** Lista paginada (cursor por fecha) de hilos de la casilla del usuario. */
export async function listCorreoThreads(params: {
  tenantId: string;
  emailAccountId: string;
  mailboxEmail?: string | null;
  cursor?: string | null;
  limit?: number;
  folder?: CorreoListFilter;
}): Promise<{ items: CorreoThreadDTO[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  const cursorDate = params.cursor ? new Date(params.cursor) : null;
  const folder = params.folder ?? "inbox";
  // Pospuestos ordena por vencimiento ascendente (lo próximo a despertar arriba).
  const isSnoozed = folder === "snoozed";
  const hasCursor = cursorDate && !Number.isNaN(cursorDate.getTime());
  const [rows, company] = await Promise.all([
    prisma.crmEmailThread.findMany({
      where: {
        tenantId: params.tenantId,
        emailAccountId: params.emailAccountId,
        ...folderWhere(folder),
        ...(hasCursor
          ? isSnoozed
            ? { snoozedUntil: { gt: cursorDate } }
            : { lastMessageAt: { lt: cursorDate } }
          : {}),
      },
      orderBy: isSnoozed ? { snoozedUntil: "asc" } : { lastMessageAt: "desc" },
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
        archivedAt: true,
        trashedAt: true,
        snoozedUntil: true,
        isUnread: true,
        messages: {
          select: { fromEmail: true, textBody: true, htmlBody: true },
          orderBy: { sentAt: "desc" },
          take: 1,
        },
        _count: { select: { messages: true } },
      },
    }),
    getTenantCompanyConfig(params.tenantId),
  ]);

  const tenantDomains = new Set<string>();
  for (const e of [
    company.emailFromAddress,
    company.email,
    company.emailOps,
    company.emailFinance,
    company.emailContact,
    company.emailReplyTo,
  ]) {
    const d = domainOf(e);
    if (d) tenantDomains.add(d);
  }
  const mailboxDom = domainOf(params.mailboxEmail ?? null);
  if (mailboxDom && !isPublicMailDomain(mailboxDom)) tenantDomains.add(mailboxDom);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const accountIds = Array.from(new Set(page.map((r) => r.accountId).filter(Boolean) as string[]));
  const dealIds = Array.from(new Set(page.map((r) => r.dealId).filter(Boolean) as string[]));
  const [accounts, deals] = await Promise.all([
    accountIds.length
      ? prisma.crmAccount.findMany({
          where: { tenantId: params.tenantId, id: { in: accountIds } },
          select: { id: true, name: true },
        })
      : [],
    dealIds.length
      ? prisma.crmDeal.findMany({
          where: { tenantId: params.tenantId, id: { in: dealIds } },
          select: { id: true, title: true },
        })
      : [],
  ]);
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));
  const dealMap = new Map(deals.map((d) => [d.id, d.title]));

  const items: CorreoThreadDTO[] = page.map((r) => {
    const msg = r.messages[0];
    const from = msg?.fromEmail ?? null;
    // Solo keywords comerciales en el asunto. Un adjunto por sí solo NO es
    // señal de lead (comprobantes bancarios, facturas y reportes traen
    // adjuntos y generaban falsos "Posible lead").
    const kw = KEYWORDS.some((k) => r.subject.toLowerCase().includes(k));
    const system = isSystemSender(from, tenantDomains);
    const snippet =
      snippetFromBody(msg?.textBody) ??
      snippetFromBody(msg?.htmlBody?.replace(/<[^>]+>/g, " ") ?? null);
    return {
      id: r.id,
      subject: r.subject,
      fromEmail: from,
      snippet,
      lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
      accountId: r.accountId,
      accountName: r.accountId ? accMap.get(r.accountId) ?? null : null,
      dealId: r.dealId,
      dealTitle: r.dealId ? dealMap.get(r.dealId) ?? null : null,
      leadId: r.leadId,
      attachmentCount: r.attachmentCount,
      messageCount: r._count.messages,
      providerThreadId: r.providerThreadId,
      possibleLead: !system && !r.accountId && !r.leadId && kw,
      isUnread: r.isUnread,
      archivedAt: r.archivedAt?.toISOString() ?? null,
      trashedAt: r.trashedAt?.toISOString() ?? null,
      snoozedUntil: r.snoozedUntil?.toISOString() ?? null,
    };
  });

  const last = page[page.length - 1];
  const nextCursor = hasMore
    ? (isSnoozed ? last?.snoozedUntil : last?.lastMessageAt)?.toISOString() ?? null
    : null;
  return { items, nextCursor };
}
