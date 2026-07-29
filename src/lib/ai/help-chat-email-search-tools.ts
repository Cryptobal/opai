/**
 * Tools de búsqueda de correo del asistente (filtros estructurados + entity resolve).
 * Extraídas de help-chat-tools-v2 para mantener el grounding y el loop de relajación.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RolePermissions } from "@/lib/permissions";

const COUNT_GROUP_BY = ["sender", "domain", "month", "vertical"] as const;
type CountGroupBy = (typeof COUNT_GROUP_BY)[number];

/** Compone el query Gmail-like a partir de args estructurados del asistente. */
export function composeEmailToolQuery(args: Record<string, unknown>): {
  parts: string[];
  folder: string;
  composed: string;
} {
  const queryText = typeof args.query === "string" ? args.query.trim() : "";
  const parts: string[] = [];
  if (queryText) parts.push(queryText);
  if (typeof args.from === "string" && args.from.trim()) {
    parts.push(`from:${args.from.trim()}`);
  }
  if (typeof args.to === "string" && args.to.trim()) {
    parts.push(`to:${args.to.trim()}`);
  }
  if (typeof args.domain === "string" && args.domain.trim()) {
    parts.push(`domain:${args.domain.trim().replace(/^@/, "")}`);
  }
  if (typeof args.subject === "string" && args.subject.trim()) {
    const s = args.subject.trim();
    parts.push(s.includes(" ") ? `subject:"${s}"` : `subject:${s}`);
  }
  if (typeof args.newerThan === "string" && args.newerThan.trim()) {
    parts.push(`newer_than:${args.newerThan.trim()}`);
  }
  if (typeof args.olderThan === "string" && args.olderThan.trim()) {
    parts.push(`older_than:${args.olderThan.trim()}`);
  }
  if (args.hasAttachment === true) parts.push("has:attachment");
  if (args.unread === true) parts.push("is:unread");
  if (args.unread === false) parts.push("is:read");
  if (typeof args.vertical === "string" && args.vertical.trim()) {
    parts.push(`vertical:${args.vertical.trim().toLowerCase()}`);
  }

  let folder = "all";
  if (typeof args.folder === "string") {
    const f = args.folder.trim().toLowerCase();
    if (f) folder = f;
  }
  if (!parts.some((p) => /^in:/i.test(p))) {
    parts.push(`in:${folder}`);
  }

  return { parts, folder, composed: parts.join(" ").trim() };
}

export async function toolSearchEmails(
  tenantId: string,
  userId: string,
  args: Record<string, unknown>,
  _perms: RolePermissions,
): Promise<unknown> {
  const limit = Math.min(Math.max(Number(args.limit) || 6, 1), 25);
  const exactOnly = args.exactOnly === true;

  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!account) {
    return { ok: false, error: "El usuario no tiene una casilla Gmail conectada." };
  }

  const {
    parseCorreoSearchQuery,
    CORREO_LIST_FILTERS,
    CORREO_SEARCH_VERTICALS,
  } = await import("@/modules/crm/email/correos-search");
  const { hybridSearchThreadIds } = await import(
    "@/modules/crm/email/correos-search-hybrid"
  );

  // Re-validar vertical contra el catálogo (composeEmailToolQuery es genérico).
  if (typeof args.vertical === "string") {
    const v = args.vertical.trim().toLowerCase();
    if (!(CORREO_SEARCH_VERTICALS as readonly string[]).includes(v)) {
      delete args.vertical;
    }
  }
  if (typeof args.folder === "string") {
    const f = args.folder.trim().toLowerCase();
    if (!(CORREO_LIST_FILTERS as readonly string[]).includes(f)) {
      args = { ...args, folder: "all" };
    }
  }

  const { parts, folder, composed } = composeEmailToolQuery(args);
  if (!composed) {
    return { ok: false, error: "query o al menos un filtro es obligatorio" };
  }
  const effectiveParsed = parseCorreoSearchQuery(composed);
  if (!effectiveParsed) {
    return { ok: true, results: [], note: "Sin criterios de búsqueda válidos.", filters: parts };
  }

  const effectiveFolder =
    effectiveParsed.folderOverride ??
    ((CORREO_LIST_FILTERS as readonly string[]).includes(folder)
      ? (folder as (typeof CORREO_LIST_FILTERS)[number])
      : "all");
  const hybrid = await hybridSearchThreadIds({
    tenantId,
    emailAccountId: account.id,
    parsed: effectiveParsed,
    folder: effectiveFolder,
    limit,
    exactOnly,
  });

  if (hybrid.ids.length === 0) {
    return {
      ok: true,
      results: [],
      filters: parts,
      hasExactMatches: false,
      lexicalCount: hybrid.lexicalCount,
      semanticCount: hybrid.semanticCount,
      discardedSemantic: hybrid.discardedSemantic,
      semanticAvailable: hybrid.semanticAvailable,
      note:
        "Sin resultados con esos filtros exactos. Relajá UNA faceta (quitar newerThan, folder=all, soltar un término, o exactOnly=false) y reintentá. Si mailbox_coverage indica que el rango no cubre la fecha, decilo: es 'no indexado', no 'no existe'. PROHIBIDO inventar el correo.",
    };
  }

  const threads = await prisma.crmEmailThread.findMany({
    where: {
      tenantId,
      emailAccountId: account.id,
      id: { in: hybrid.ids },
    },
    select: {
      id: true,
      subject: true,
      lastMessageAt: true,
      attachmentCount: true,
      isUnread: true,
      aiVertical: true,
      accountId: true,
      messages: {
        select: { id: true, fromEmail: true },
        orderBy: { sentAt: "desc" },
        take: 1,
      },
    },
  });
  const accountIds = threads.map((t) => t.accountId).filter(Boolean) as string[];
  const accounts = accountIds.length
    ? await prisma.crmAccount.findMany({
        where: { tenantId, id: { in: accountIds } },
        select: { id: true, name: true },
      })
    : [];
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));
  const order = new Map(hybrid.ids.map((id, i) => [id, i]));
  threads.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return {
    ok: true,
    filters: parts,
    hasExactMatches: hybrid.hasExactMatches,
    lexicalCount: hybrid.lexicalCount,
    semanticCount: hybrid.semanticCount,
    discardedSemantic: hybrid.discardedSemantic,
    semanticAvailable: hybrid.semanticAvailable,
    results: threads.map((t) => ({
      threadId: t.id,
      messageId: t.messages[0]?.id ?? null,
      subject: t.subject,
      fromEmail: t.messages[0]?.fromEmail ?? null,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
      accountName: t.accountId ? accMap.get(t.accountId) ?? null : null,
      attachmentCount: t.attachmentCount,
      isUnread: t.isUnread,
      aiVertical: t.aiVertical,
      matchReason: hybrid.reasonById.get(t.id) ?? null,
      excerpt: hybrid.excerptById.get(t.id) ?? "",
      url: `/crm/correos?hilo=${t.id}${
        t.messages[0]?.id ? `&mensaje=${t.messages[0].id}` : ""
      }`,
    })),
    instruction:
      "Respondé en prosa breve anclada a threadId/messageId de results. Si hasExactMatches=false, decí que no hubo coincidencia exacta. :::cards con action navigate a url. NUNCA inventes contenido. Las capturas del usuario NO son fuente de verdad del sistema.",
  };
}

/**
 * Conteo / agregación léxica sobre la casilla (sin rama semántica).
 * Solo agregados — no expone asuntos ni cuerpos.
 */
export async function toolCountEmails(
  tenantId: string,
  userId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!account) {
    return { ok: false, error: "El usuario no tiene una casilla Gmail conectada." };
  }

  const {
    parseCorreoSearchQuery,
    buildCorreoSearchParts,
    folderWhereSql,
    CORREO_LIST_FILTERS,
    CORREO_SEARCH_VERTICALS,
  } = await import("@/modules/crm/email/correos-search");

  if (typeof args.vertical === "string") {
    const v = args.vertical.trim().toLowerCase();
    if (!(CORREO_SEARCH_VERTICALS as readonly string[]).includes(v)) {
      delete args.vertical;
    }
  }
  if (typeof args.folder === "string") {
    const f = args.folder.trim().toLowerCase();
    if (!(CORREO_LIST_FILTERS as readonly string[]).includes(f)) {
      args = { ...args, folder: "all" };
    }
  }

  const { parts, folder, composed } = composeEmailToolQuery(args);
  if (!composed) {
    return { ok: false, error: "query o al menos un filtro es obligatorio" };
  }
  const parsed = parseCorreoSearchQuery(composed);
  if (!parsed) {
    return { ok: true, total: 0, filters: parts, note: "Sin criterios válidos." };
  }

  const effectiveFolder =
    parsed.folderOverride ??
    ((CORREO_LIST_FILTERS as readonly string[]).includes(folder)
      ? (folder as (typeof CORREO_LIST_FILTERS)[number])
      : "all");
  const searchParts = buildCorreoSearchParts(parsed);
  const now = new Date();
  const conds: Prisma.Sql[] = [
    Prisma.sql`t.tenant_id::text = ${tenantId}`,
    Prisma.sql`t.email_account_id = ${account.id}::uuid`,
    folderWhereSql(effectiveFolder, now),
    ...searchParts.structural,
    ...searchParts.text,
  ];

  const groupByRaw =
    typeof args.groupBy === "string" ? args.groupBy.trim().toLowerCase() : "";
  const groupBy = (COUNT_GROUP_BY as readonly string[]).includes(groupByRaw)
    ? (groupByRaw as CountGroupBy)
    : null;

  if (!groupBy) {
    const rows = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM crm.email_threads t
      WHERE ${Prisma.join(conds, " AND ")}
    `);
    return {
      ok: true,
      total: Number(rows[0]?.total ?? 0),
      filters: parts,
      folder: effectiveFolder,
      instruction:
        "Usá este total como cifra autoritativa. PROHIBIDO extrapolar desde search_emails.",
    };
  }

  const whereSql = Prisma.join(conds, " AND ");
  const groups =
    groupBy === "sender"
      ? await prisma.$queryRaw<Array<{ key: string | null; total: bigint }>>(Prisma.sql`
          SELECT LOWER(lm.from_email) AS key, COUNT(*)::bigint AS total
          FROM crm.email_threads t
          JOIN LATERAL (
            SELECT m.from_email FROM crm.email_messages m
            WHERE m.thread_id = t.id AND m.is_draft = false
              AND m.tenant_id::text = ${tenantId}
              AND m.email_account_id = ${account.id}::uuid
            ORDER BY m.sent_at DESC NULLS LAST LIMIT 1
          ) lm ON true
          WHERE ${whereSql}
          GROUP BY 1
          ORDER BY total DESC NULLS LAST
          LIMIT 50
        `)
      : groupBy === "domain"
        ? await prisma.$queryRaw<Array<{ key: string | null; total: bigint }>>(Prisma.sql`
            SELECT split_part(LOWER(lm.from_email), '@', 2) AS key, COUNT(*)::bigint AS total
            FROM crm.email_threads t
            JOIN LATERAL (
              SELECT m.from_email FROM crm.email_messages m
              WHERE m.thread_id = t.id AND m.is_draft = false
                AND m.tenant_id::text = ${tenantId}
                AND m.email_account_id = ${account.id}::uuid
              ORDER BY m.sent_at DESC NULLS LAST LIMIT 1
            ) lm ON true
            WHERE ${whereSql}
            GROUP BY 1
            ORDER BY total DESC NULLS LAST
            LIMIT 50
          `)
        : groupBy === "month"
          ? await prisma.$queryRaw<Array<{ key: string | null; total: bigint }>>(Prisma.sql`
              SELECT to_char(t.last_message_at AT TIME ZONE 'America/Santiago', 'YYYY-MM') AS key,
                     COUNT(*)::bigint AS total
              FROM crm.email_threads t
              WHERE ${whereSql}
              GROUP BY 1
              ORDER BY key DESC NULLS LAST
              LIMIT 50
            `)
          : await prisma.$queryRaw<Array<{ key: string | null; total: bigint }>>(Prisma.sql`
              SELECT COALESCE(t.vertical_override, t.ai_vertical, 'otro') AS key,
                     COUNT(*)::bigint AS total
              FROM crm.email_threads t
              WHERE ${whereSql}
              GROUP BY 1
              ORDER BY total DESC NULLS LAST
              LIMIT 50
            `);

  const total = groups.reduce((sum, g) => sum + Number(g.total), 0);
  return {
    ok: true,
    total,
    groupBy,
    groups: groups.map((g) => ({
      key: g.key ?? "(sin valor)",
      count: Number(g.total),
    })),
    filters: parts,
    folder: effectiveFolder,
    instruction:
      "Usá estos agregados como cifras autoritativas. No listes asuntos. PROHIBIDO extrapolar desde search_emails.",
  };
}

export async function toolResolveEntity(
  tenantId: string,
  userId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const text = typeof args.text === "string" ? args.text.trim() : "";
  if (!text) return { ok: false, error: "text es obligatorio" };
  const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20);
  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId, provider: "gmail", status: "active" },
    select: { id: true },
  });
  const { resolveEntity } = await import("@/modules/crm/email/correos-resolve-entity");
  const entities = await resolveEntity({
    tenantId,
    userId,
    text,
    emailAccountId: account?.id ?? null,
    limit,
  });
  return {
    ok: true,
    entities,
    instruction:
      "Usá email → to:/from: y domain → domain: en search_emails. No pidas el email si ya lo resolviste.",
  };
}

export async function toolMailboxCoverage(
  tenantId: string,
  userId: string,
): Promise<unknown> {
  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId, provider: "gmail", status: "active" },
    select: { id: true, email: true, syncState: true },
  });
  if (!account) {
    return { ok: false, error: "El usuario no tiene una casilla Gmail conectada." };
  }
  const { getEmailIndexCoverage } = await import(
    "@/modules/crm/email/email-index-coverage"
  );
  const coverage = await getEmailIndexCoverage({
    tenantId,
    emailAccountId: account.id,
  });
  const bounds = await prisma.crmEmailMessage.aggregate({
    where: {
      tenantId,
      emailAccountId: account.id,
      isDraft: false,
      sentAt: { lt: new Date("2100-01-01") },
    },
    _min: { sentAt: true },
    _max: { sentAt: true },
    _count: true,
  });
  const sync =
    account.syncState &&
    typeof account.syncState === "object" &&
    !Array.isArray(account.syncState)
      ? (account.syncState as { backfillDone?: boolean; backfillQuery?: string })
      : {};
  return {
    ok: true,
    email: account.email,
    messageCount: bounds._count,
    oldestSentAt: bounds._min.sentAt?.toISOString() ?? null,
    newestSentAt: bounds._max.sentAt?.toISOString() ?? null,
    embeddingsPct: coverage.pct,
    backfillDone: Boolean(sync.backfillDone),
    backfillQuery: sync.backfillQuery ?? null,
    instruction:
      "Si buscan un correo anterior a oldestSentAt, es cobertura incompleta, no 'no existe'.",
  };
}
