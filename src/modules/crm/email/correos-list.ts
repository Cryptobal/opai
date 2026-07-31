import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import type { CorreoThreadDTO } from "./correos.types";
import {
  buildTenantDomains,
  isSystemSender,
  snippetFromBody,
} from "./correos-list-helpers";
import {
  buildCorreoSearchIdsQuery,
  parseCorreoSearchQuery,
} from "./correos-search";
import type { MatchReason } from "./correos-search-hybrid";
import {
  getSlaThresholds,
  resolveThreadSla,
} from "./thread-sla";
import {
  findThreadIdsWithOpenTasks,
  loadThreadTaskAgg,
} from "./correos-thread-tasks";

const KEYWORDS = ["cotiz", "licitac", "servicio", "propuesta", "bases", "presupuesto"];

/** Cursor opaco de la rama híbrida: `search:{offset}` (0 ≤ offset ≤ 500). */
function parseSearchOffsetCursor(cursor: string | null | undefined): number | null {
  if (!cursor || !cursor.startsWith("search:")) return null;
  const n = Number(cursor.slice("search:".length));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 500);
}

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
 * Recibidos = espejo estricto del label INBOX de Gmail (más archivedAt null y
 * sin pospuestos vigentes). Sin el filtro de label, el backfill `in:sent`
 * inundaba Recibidos con miles de hilos que Gmail nunca muestra ahí.
 */
export function folderWhere(folder: CorreoListFilter) {
  const now = new Date();
  if (folder === "trash") return { trashedAt: { not: null } };
  if (folder === "snoozed") return { trashedAt: null, spamAt: null, snoozedUntil: { gt: now } };
  // Archivados excluye pospuestos vigentes (pueden tener archivedAt residual
  // del sync de labels; su carpeta canónica es Pospuestos).
  if (folder === "archived") {
    return {
      trashedAt: null,
      spamAt: null,
      archivedAt: { not: null },
      ...notSnoozedWhere(now),
    };
  }
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
  return {
    trashedAt: null,
    spamAt: null,
    archivedAt: null,
    messages: { some: { labelIds: { has: "INBOX" } } },
    ...notSnoozedWhere(now),
  };
}

const THREAD_LIST_SELECT = {
  id: true,
  subject: true,
  emailAccountId: true,
  accountId: true,
  dealId: true,
  leadId: true,
  lastMessageAt: true,
  lastInboundAt: true,
  lastOutboundAt: true,
  providerThreadId: true,
  attachmentCount: true,
  archivedAt: true,
  trashedAt: true,
  snoozedUntil: true,
  starredAt: true,
  spamAt: true,
  isUnread: true,
  messages: {
    select: { fromEmail: true, textBody: true, htmlBody: true, isDraft: true },
    orderBy: { sentAt: "desc" as const },
    take: 1,
  },
  _count: { select: { messages: true } },
} as const;

/**
 * Lista paginada de hilos de la casilla del usuario.
 *
 * Con `q` activo y términos de texto libre: motor híbrido (léxico + semántico).
 * El cursor de esa rama es opaco con prefijo `search:{offset}` (offset sobre
 * el ranking fusionado). Con solo operadores estructurales: léxico por
 * recencia con cursor ISO de fecha. Sin `q`: cursor ISO de fecha por carpeta.
 *
 * Alcance: si hay búsqueda activa y el query NO trae `in:`, el scope efectivo
 * es `all` (toda la casilla excepto trash/spam), no la carpeta de navegación.
 * Por defecto la búsqueda de texto libre es léxica (`exactOnly`); la rama
 * semántica se habilita con `exactOnly: false` (query `semantic=1`).
 */
export async function listCorreoThreads(params: {
  tenantId: string;
  emailAccountIds: string[];
  mailboxEmail?: string | null;
  cursor?: string | null;
  limit?: number;
  folder?: CorreoListFilter;
  q?: string | null;
  /** Solo hilos con tareas abiertas. Ignorado si hay búsqueda `q`. */
  withTasks?: boolean;
  /**
   * Si true (default), no ejecuta la rama semántica. El endpoint mapea
   * `semantic=1` → `exactOnly: false`.
   */
  exactOnly?: boolean;
}): Promise<{
  items: CorreoThreadDTO[];
  nextCursor: string | null;
  semanticAvailable?: boolean;
  searchMeta?: import("./correos.types").CorreoSearchMeta;
  /** Carpeta efectiva bajo búsqueda (`all` por defecto si no hay `in:`). */
  searchScope?: import("./correos.types").CorreoSearchScope;
}> {
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  const emailAccountIds = params.emailAccountIds;
  if (emailAccountIds.length === 0) {
    return { items: [], nextCursor: null, semanticAvailable: true };
  }
  const searchOffset = parseSearchOffsetCursor(params.cursor);
  const cursorDate =
    searchOffset == null && params.cursor ? new Date(params.cursor) : null;
  const folder = params.folder ?? "inbox";
  const parsedSearch = parseCorreoSearchQuery(params.q);
  // Búsqueda activa sin `in:` → toda la casilla (paridad con Gmail).
  const searchScope: CorreoListFilter | undefined = parsedSearch
    ? (parsedSearch.folderOverride ?? "all")
    : undefined;
  const effectiveFolder = searchScope ?? folder;

  // Filtro withTasks: solo sin búsqueda activa.
  let withTasksIds: string[] | null = null;
  if (params.withTasks && !parsedSearch) {
    withTasksIds = await findThreadIdsWithOpenTasks(params.tenantId);
    if (withTasksIds.length === 0) {
      return { items: [], nextCursor: null, semanticAvailable: true };
    }
  }

  // Búsqueda con texto libre → motor híbrido con paginación por score.
  if (parsedSearch && parsedSearch.terms.length > 0) {
    const offset = searchOffset ?? 0;
    const { hybridSearchThreadIds } = await import("./correos-search-hybrid");
    const hybrid = await hybridSearchThreadIds({
      tenantId: params.tenantId,
      emailAccountIds,
      parsed: parsedSearch,
      folder: effectiveFolder,
      limit,
      offset,
      exactOnly: params.exactOnly !== false,
    });
    const nextOffset = offset + hybrid.ids.length;
    const nextCursor =
      hybrid.ids.length > 0 && nextOffset < hybrid.totalCount
        ? `search:${nextOffset}`
        : null;
    if (hybrid.ids.length === 0) {
      return {
        items: [],
        nextCursor: null,
        semanticAvailable: hybrid.semanticAvailable,
        searchScope: effectiveFolder,
        searchMeta: {
          hasExactMatches: false,
          lexicalCount: hybrid.lexicalCount,
          semanticCount: hybrid.semanticCount,
          discardedSemantic: hybrid.discardedSemantic,
          shownCount: 0,
          totalCount: hybrid.totalCount,
          totalIsLowerBound: hybrid.totalIsLowerBound,
          semanticRan: hybrid.semanticRan,
        },
      };
    }
    const [threads, company] = await Promise.all([
      prisma.crmEmailThread.findMany({
        where: {
          tenantId: params.tenantId,
          emailAccountId: { in: emailAccountIds },
          id: { in: hybrid.ids },
        },
        select: THREAD_LIST_SELECT,
      }),
      getTenantCompanyConfig(params.tenantId),
    ]);
    const order = new Map(hybrid.ids.map((id, i) => [id, i]));
    const sorted = threads.sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
    const items = await mapThreadRowsInternal(
      sorted,
      params.tenantId,
      company,
      params.mailboxEmail,
      hybrid.reasonById,
    );
    return {
      items,
      nextCursor,
      semanticAvailable: hybrid.semanticAvailable,
      searchScope: effectiveFolder,
      searchMeta: {
        hasExactMatches: hybrid.hasExactMatches,
        lexicalCount: hybrid.lexicalCount,
        semanticCount: hybrid.semanticCount,
        discardedSemantic: hybrid.discardedSemantic,
        shownCount: items.length,
        totalCount: hybrid.totalCount,
        totalIsLowerBound: hybrid.totalIsLowerBound,
        semanticRan: hybrid.semanticRan,
      },
    };
  }

  // Pospuestos ordena por vencimiento ascendente (lo próximo a despertar
  // arriba); bajo búsqueda toda carpeta ordena por recencia.
  const isSnoozed = effectiveFolder === "snoozed" && !parsedSearch;
  const hasCursor = Boolean(cursorDate && !Number.isNaN(cursorDate.getTime()));

  const fetchRows = async () => {
    if (!parsedSearch) {
      return prisma.crmEmailThread.findMany({
        where: {
          tenantId: params.tenantId,
          emailAccountId: { in: emailAccountIds },
          ...folderWhere(effectiveFolder),
          ...(withTasksIds ? { id: { in: withTasksIds } } : {}),
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
    // Solo operadores estructurales: léxico + cursor de fecha.
    const idRows = await prisma.$queryRaw<Array<{ id: string; last_message_at: Date | null }>>(
      buildCorreoSearchIdsQuery({
        tenantId: params.tenantId,
        emailAccountIds,
        parsed: parsedSearch,
        folder: effectiveFolder,
        cursorDate: hasCursor ? cursorDate : null,
        take: limit + 1,
        structuralOnly: true,
      }),
    );
    if (idRows.length === 0) return [];
    const threads = await prisma.crmEmailThread.findMany({
      where: {
        tenantId: params.tenantId,
        emailAccountId: { in: emailAccountIds },
        id: { in: idRows.map((r) => r.id) },
      },
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
  const reasonById = parsedSearch
    ? new Map(page.map((r) => [r.id, "lexical" as MatchReason]))
    : undefined;
  const items = await mapThreadRowsInternal(
    page,
    params.tenantId,
    company,
    params.mailboxEmail,
    reasonById,
  );

  const last = page[page.length - 1];
  const nextCursor = hasMore
    ? (isSnoozed ? last?.snoozedUntil : last?.lastMessageAt)?.toISOString() ?? null
    : null;
  return {
    items,
    nextCursor,
    semanticAvailable: true,
    ...(searchScope ? { searchScope: effectiveFolder } : {}),
  };
}

type ThreadRow = {
  id: string;
  subject: string;
  emailAccountId: string | null;
  accountId: string | null;
  dealId: string | null;
  leadId: string | null;
  lastMessageAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  providerThreadId: string | null;
  attachmentCount: number;
  archivedAt: Date | null;
  trashedAt: Date | null;
  snoozedUntil: Date | null;
  starredAt: Date | null;
  spamAt: Date | null;
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
  reasonById?: Map<string, MatchReason>,
): Promise<CorreoThreadDTO[]> {
  const tenantDomains = buildTenantDomains(company, mailboxEmail);

  const accountIds = Array.from(new Set(page.map((r) => r.accountId).filter(Boolean) as string[]));
  const dealIds = Array.from(new Set(page.map((r) => r.dealId).filter(Boolean) as string[]));
  // Hilos potencialmente en espera: inbound sin outbound posterior.
  const pendingThreadIds = page
    .filter(
      (r) =>
        r.accountId &&
        r.lastInboundAt &&
        (!r.lastOutboundAt || r.lastOutboundAt.getTime() < r.lastInboundAt.getTime()) &&
        !r.archivedAt &&
        !r.trashedAt &&
        !r.spamAt,
    )
    .map((r) => r.id);

  const threadIds = page.map((r) => r.id);
  const [accounts, deals, thresholds, lastInbounds, taskAgg] = await Promise.all([
    accountIds.length
      ? prisma.crmAccount.findMany({
          where: { tenantId, id: { in: accountIds } },
          select: { id: true, name: true },
        })
      : [],
    dealIds.length
      ? prisma.crmDeal.findMany({
          where: { tenantId, id: { in: dealIds } },
          select: {
            id: true,
            title: true,
            status: true,
            stage: { select: { name: true } },
          },
        })
      : [],
    getSlaThresholds(tenantId),
    pendingThreadIds.length
      ? prisma.crmEmailMessage.findMany({
          where: {
            tenantId,
            threadId: { in: pendingThreadIds },
            direction: "in",
            isDraft: false,
          },
          orderBy: { sentAt: "desc" },
          distinct: ["threadId"],
          select: { threadId: true, fromEmail: true },
        })
      : [],
    loadThreadTaskAgg(tenantId, threadIds),
  ]);
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));
  const dealMap = new Map(
    deals.map((d) => [
      d.id,
      { title: d.title, status: d.status, stageName: d.stage?.name ?? null },
    ]),
  );
  const inboundFromByThread = new Map(
    lastInbounds.map((m) => [m.threadId, m.fromEmail]),
  );

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
    const deal = r.dealId ? dealMap.get(r.dealId) : undefined;
    const inboundFrom = inboundFromByThread.get(r.id) ?? null;
    const inboundIsOwnOrSystem = isSystemSender(inboundFrom, tenantDomains);
    const sla = resolveThreadSla(
      {
        lastInboundAt: r.lastInboundAt,
        lastOutboundAt: r.lastOutboundAt,
        accountId: r.accountId,
        dealId: r.dealId,
        dealIsOpen: deal ? deal.status === "open" : null,
        archivedAt: r.archivedAt,
        trashedAt: r.trashedAt,
        spamAt: r.spamAt,
        snoozedUntil: r.snoozedUntil,
        lastInboundIsOwn: inboundIsOwnOrSystem,
        lastInboundIsSystem: inboundIsOwnOrSystem,
      },
      { thresholds },
    );
    return {
      id: r.id,
      subject: r.subject,
      fromEmail: from,
      snippet,
      lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
      emailAccountId: r.emailAccountId,
      accountId: r.accountId,
      accountName: r.accountId ? accMap.get(r.accountId) ?? null : null,
      dealId: r.dealId,
      dealTitle: deal?.title ?? null,
      dealStageName: deal?.stageName ?? null,
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
      pendingSince: sla.pendingSince,
      slaLevel: sla.level,
      slaLabel: sla.label,
      matchReason: reasonById?.get(r.id) ?? null,
      openTaskCount: taskAgg.get(r.id)?.openTaskCount ?? 0,
      taskDueLevel: taskAgg.get(r.id)?.taskDueLevel ?? null,
    };
  });
}
