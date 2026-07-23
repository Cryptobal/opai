import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import type { CorreoThreadDTO } from "./correos.types";
import {
  domainOf,
  isPublicMailDomain,
  isSystemSender,
  snippetFromBody,
} from "./correos-list-helpers";
import {
  buildCorreoSearchIdsQuery,
  parseCorreoSearchQuery,
} from "./correos-search";

const KEYWORDS = ["cotiz", "licitac", "servicio", "propuesta", "bases", "presupuesto"];

export type CorreoListFilter =
  | "inbox"
  | "archived"
  | "all"
  | "trash"
  | "snoozed"
  | "sent"
  | "drafts"
  | "spam"
  | "starred";

/**
 * "No pospuesto" null-safe. NUNCA usar `NOT: { snoozedUntil: { gt: now } }`:
 * Prisma genera `NOT (snoozed_until > $1)` y la lógica ternaria de SQL
 * excluye los NULL (NULL > x → NULL → NOT NULL → NULL) — como casi todos los
 * hilos tienen `snoozedUntil` NULL, Recibidos quedaba VACÍO.
 */
export function notSnoozedWhere(now: Date) {
  return { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
}

/**
 * Spam excluido de todo menos papelera (que solo mira trashedAt), como Gmail.
 * Recibidos excluye los pospuestos vigentes (`snoozedUntil > now`); Pospuestos
 * es su propia carpeta.
 */
export function folderWhere(folder: CorreoListFilter) {
  const now = new Date();
  if (folder === "trash") return { trashedAt: { not: null } };
  if (folder === "snoozed") return { trashedAt: null, spamAt: null, snoozedUntil: { gt: now } };
  if (folder === "archived") return { trashedAt: null, spamAt: null, archivedAt: { not: null } };
  if (folder === "all") return { trashedAt: null, spamAt: null };
  // C10: Enviados = hilos con al menos un saliente real (label SENT espejado
  // en direction); Borradores = hilos con draft vivo; Spam y Destacados por
  // sus timestamps espejo.
  if (folder === "sent") {
    return {
      trashedAt: null,
      spamAt: null,
      messages: { some: { direction: "out", isDraft: false } },
    };
  }
  if (folder === "drafts") {
    return { trashedAt: null, messages: { some: { isDraft: true } } };
  }
  if (folder === "spam") return { trashedAt: null, spamAt: { not: null } };
  if (folder === "starred") {
    return { trashedAt: null, spamAt: null, starredAt: { not: null } };
  }
  return { trashedAt: null, spamAt: null, archivedAt: null, ...notSnoozedWhere(now) };
}

const THREAD_LIST_SELECT = {
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
  starredAt: true,
  spamAt: true,
  aiVertical: true,
  isUnread: true,
  messages: {
    select: { fromEmail: true, textBody: true, htmlBody: true, isDraft: true },
    orderBy: { sentAt: "desc" as const },
    take: 1,
  },
  _count: { select: { messages: true } },
} as const;

/**
 * Lista paginada (cursor por fecha) de hilos de la casilla del usuario.
 * Con `q` activo (C15) la selección de hilos corre por SQL raw contra toda la
 * casilla sincronizada (operadores from/to/domain requieren unnest de arrays,
 * imposible en el where de Prisma) y luego se hidratan los DTOs por ID.
 */
export async function listCorreoThreads(params: {
  tenantId: string;
  emailAccountId: string;
  mailboxEmail?: string | null;
  cursor?: string | null;
  limit?: number;
  folder?: CorreoListFilter;
  q?: string | null;
  /** A07: "buscar por significado" — retrieval vectorial en vez de operadores. */
  semantic?: boolean;
  /** A03: filtra por vertical de la clasificación v5. */
  vertical?: string | null;
}): Promise<{ items: CorreoThreadDTO[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  const cursorDate = params.cursor ? new Date(params.cursor) : null;
  const folder = params.folder ?? "inbox";

  // Modo semántico: ranking por distancia (sin cursor — una sola página).
  if (params.semantic && params.q?.trim()) {
    const { semanticSearchChunks, rankThreadsFromHits } = await import(
      "./email-embeddings"
    );
    const hits = await semanticSearchChunks({
      tenantId: params.tenantId,
      emailAccountId: params.emailAccountId,
      query: params.q.trim(),
      limit: 40,
    });
    const rankedIds = rankThreadsFromHits(hits, limit);
    if (rankedIds.length === 0) return { items: [], nextCursor: null };
    const [threads, company] = await Promise.all([
      prisma.crmEmailThread.findMany({
        where: {
          tenantId: params.tenantId,
          id: { in: rankedIds },
          trashedAt: null,
          spamAt: null,
        },
        select: THREAD_LIST_SELECT,
      }),
      getTenantCompanyConfig(params.tenantId),
    ]);
    const order = new Map(rankedIds.map((id, i) => [id, i]));
    const sorted = threads.sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
    return {
      items: await mapThreadRowsInternal(
        sorted,
        params.tenantId,
        company,
        params.mailboxEmail,
      ),
      nextCursor: null,
    };
  }

  const parsedSearch = parseCorreoSearchQuery(params.q);
  // Pospuestos ordena por vencimiento ascendente (lo próximo a despertar
  // arriba); bajo búsqueda toda carpeta ordena por recencia.
  const isSnoozed = folder === "snoozed" && !parsedSearch;
  const hasCursor = Boolean(cursorDate && !Number.isNaN(cursorDate.getTime()));

  const fetchRows = async () => {
    if (!parsedSearch) {
      return prisma.crmEmailThread.findMany({
        where: {
          tenantId: params.tenantId,
          emailAccountId: params.emailAccountId,
          ...folderWhere(folder),
          ...(params.vertical ? { aiVertical: params.vertical } : {}),
          ...(hasCursor && cursorDate
            ? isSnoozed
              ? { snoozedUntil: { gt: cursorDate } }
              : { lastMessageAt: { lt: cursorDate } }
            : {}),
        },
        orderBy: isSnoozed ? { snoozedUntil: "asc" } : { lastMessageAt: "desc" },
        take: limit + 1,
        select: THREAD_LIST_SELECT,
      });
    }
    const idRows = await prisma.$queryRaw<Array<{ id: string; last_message_at: Date | null }>>(
      buildCorreoSearchIdsQuery({
        tenantId: params.tenantId,
        emailAccountId: params.emailAccountId,
        parsed: parsedSearch,
        folder,
        vertical: params.vertical ?? null,
        cursorDate: hasCursor ? cursorDate : null,
        take: limit + 1,
      }),
    );
    if (idRows.length === 0) return [];
    const threads = await prisma.crmEmailThread.findMany({
      where: { tenantId: params.tenantId, id: { in: idRows.map((r) => r.id) } },
      select: THREAD_LIST_SELECT,
    });
    const order = new Map(idRows.map((r, i) => [r.id, i]));
    return threads.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  };

  const [rows, company] = await Promise.all([
    fetchRows(),
    getTenantCompanyConfig(params.tenantId),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = await mapThreadRowsInternal(
    page,
    params.tenantId,
    company,
    params.mailboxEmail,
  );

  const last = page[page.length - 1];
  const nextCursor = hasMore
    ? (isSnoozed ? last?.snoozedUntil : last?.lastMessageAt)?.toISOString() ?? null
    : null;
  return { items, nextCursor };
}

type ThreadRow = {
  id: string;
  subject: string;
  accountId: string | null;
  dealId: string | null;
  leadId: string | null;
  lastMessageAt: Date | null;
  providerThreadId: string | null;
  attachmentCount: number;
  archivedAt: Date | null;
  trashedAt: Date | null;
  snoozedUntil: Date | null;
  starredAt: Date | null;
  spamAt: Date | null;
  aiVertical: string | null;
  isUnread: boolean;
  messages: Array<{
    fromEmail: string;
    textBody: string | null;
    htmlBody: string | null;
    isDraft: boolean;
  }>;
  _count: { messages: number };
};

type CompanyConfig = Awaited<ReturnType<typeof getTenantCompanyConfig>>;

async function mapThreadRowsInternal(
  page: ThreadRow[],
  tenantId: string,
  company: CompanyConfig,
  mailboxEmail?: string | null,
): Promise<CorreoThreadDTO[]> {
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
  const mailboxDom = domainOf(mailboxEmail ?? null);
  if (mailboxDom && !isPublicMailDomain(mailboxDom)) tenantDomains.add(mailboxDom);

  const accountIds = Array.from(new Set(page.map((r) => r.accountId).filter(Boolean) as string[]));
  const dealIds = Array.from(new Set(page.map((r) => r.dealId).filter(Boolean) as string[]));
  const [accounts, deals] = await Promise.all([
    accountIds.length
      ? prisma.crmAccount.findMany({
          where: { tenantId, id: { in: accountIds } },
          select: { id: true, name: true },
        })
      : [],
    dealIds.length
      ? prisma.crmDeal.findMany({
          where: { tenantId, id: { in: dealIds } },
          select: { id: true, title: true },
        })
      : [],
  ]);
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));
  const dealMap = new Map(deals.map((d) => [d.id, d.title]));

  return page.map((r) => {
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
      starredAt: r.starredAt?.toISOString() ?? null,
      spamAt: r.spamAt?.toISOString() ?? null,
      hasDraft: Boolean(msg?.isDraft),
      aiVertical: r.aiVertical,
    };
  });
}
