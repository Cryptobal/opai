/**
 * Correos recientes para el Hub — consulta compacta sobre la base LOCAL
 * sincronizada (CrmEmailThread + CrmEmailOutbox). NUNCA llama a Gmail: solo
 * lee metadatos ya persistidos.
 *
 * Privacidad: solo casillas activas del usuario de sesión (userId), con
 * tenant scoping obligatorio. Leer esta lista no modifica `isUnread`.
 */

import { prisma } from "@/lib/prisma";
import { folderWhere } from "./correos-list";
import { snippetFromBody } from "./correos-list-helpers";
import type { EmailOutboxPayload } from "./email-outbox";

export const HUB_RECENT_EMAILS_LIMIT = 5;
export const HUB_SNOOZED_LIMIT = 5;
export const HUB_SCHEDULED_LIMIT = 5;
const SNIPPET_MAX = 80;

export type HubEmailItem = {
  id: string;
  subject: string;
  fromEmail: string | null;
  snippet: string | null;
  lastMessageAt: string | null;
  isUnread: boolean;
  hasAttachment: boolean;
  /** Identidad de la casilla de origen (solo relevante con >1 casilla). */
  accountEmail: string;
  /** ISO si el hilo está pospuesto (sección Pospuestos del Hub). */
  snoozedUntil?: string | null;
};

export type HubScheduledItem = {
  id: string;
  subject: string;
  to: string[];
  scheduledAt: string | null;
  status: string;
  threadId: string | null;
};

export type HubRecentEmails = {
  connected: boolean;
  /** Casillas activas del usuario (para mostrar identidad si hay >1). */
  accountEmails: string[];
  unreadCount: number;
  items: HubEmailItem[];
  snoozed: HubEmailItem[];
  scheduled: HubScheduledItem[];
};

type ThreadRow = {
  id: string;
  subject: string;
  lastMessageAt: Date | null;
  isUnread: boolean;
  attachmentCount: number;
  providerThreadId: string | null;
  snoozedUntil?: Date | null;
  messages: { fromEmail: string | null; textBody: string | null; htmlBody: string | null }[];
  accountEmail: string;
};

function shortSnippet(row: ThreadRow): string | null {
  const msg = row.messages[0];
  const raw =
    snippetFromBody(msg?.textBody) ??
    snippetFromBody(msg?.htmlBody?.replace(/<[^>]+>/g, " ") ?? null);
  if (!raw) return null;
  return raw.length > SNIPPET_MAX ? `${raw.slice(0, SNIPPET_MAX)}…` : raw;
}

function toHubItem(row: ThreadRow): HubEmailItem {
  return {
    id: row.id,
    subject: row.subject,
    fromEmail: row.messages[0]?.fromEmail ?? null,
    snippet: shortSnippet(row),
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    isUnread: row.isUnread,
    hasAttachment: row.attachmentCount > 0,
    accountEmail: row.accountEmail,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
  };
}

/**
 * Merge puro de hilos de N casillas: dedup por providerThreadId (o id),
 * orden predecible — no leídos más recientes primero, luego leídos
 * recientes — y límite duro. Exportado para tests.
 */
export function mergeHubEmailThreads(
  rows: ThreadRow[],
  limit = HUB_RECENT_EMAILS_LIMIT,
): HubEmailItem[] {
  const seen = new Set<string>();
  const deduped: ThreadRow[] = [];
  for (const row of rows) {
    const key = row.providerThreadId ?? row.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  deduped.sort((a, b) => {
    if (a.isUnread !== b.isUnread) return a.isUnread ? -1 : 1;
    return (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0);
  });
  return deduped.slice(0, Math.max(1, limit)).map(toHubItem);
}

/** Pospuestos: orden por despertar más próximo. */
export function mergeHubSnoozedThreads(
  rows: ThreadRow[],
  limit = HUB_SNOOZED_LIMIT,
): HubEmailItem[] {
  const seen = new Set<string>();
  const deduped: ThreadRow[] = [];
  for (const row of rows) {
    const key = row.providerThreadId ?? row.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  deduped.sort(
    (a, b) => (a.snoozedUntil?.getTime() ?? 0) - (b.snoozedUntil?.getTime() ?? 0),
  );
  return deduped.slice(0, Math.max(1, limit)).map(toHubItem);
}

const THREAD_SELECT = {
  id: true,
  subject: true,
  lastMessageAt: true,
  isUnread: true,
  attachmentCount: true,
  providerThreadId: true,
  snoozedUntil: true,
  messages: {
    select: { fromEmail: true, textBody: true, htmlBody: true },
    orderBy: { sentAt: "desc" as const },
    take: 1,
  },
} as const;

/** Correos recientes + pospuestos + programados del usuario (solo lectura). */
export async function getHubRecentEmails(params: {
  tenantId: string;
  userId: string;
  limit?: number;
}): Promise<HubRecentEmails> {
  const limit = Math.min(Math.max(params.limit ?? HUB_RECENT_EMAILS_LIMIT, 1), HUB_RECENT_EMAILS_LIMIT);

  const accounts = await prisma.crmEmailAccount.findMany({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      provider: "gmail",
      status: "active",
    },
    select: { id: true, email: true },
  });

  if (accounts.length === 0) {
    return {
      connected: false,
      accountEmails: [],
      unreadCount: 0,
      items: [],
      snoozed: [],
      scheduled: [],
    };
  }

  const inboxWhere = folderWhere("inbox");
  const snoozedWhere = folderWhere("snoozed");

  const [perAccount, outboxRows] = await Promise.all([
    Promise.all(
      accounts.map(async (account) => {
        const [rows, snoozedRows, unread] = await Promise.all([
          prisma.crmEmailThread.findMany({
            where: {
              tenantId: params.tenantId,
              emailAccountId: account.id,
              ...inboxWhere,
            },
            orderBy: [{ isUnread: "desc" }, { lastMessageAt: "desc" }],
            take: limit,
            select: THREAD_SELECT,
          }),
          prisma.crmEmailThread.findMany({
            where: {
              tenantId: params.tenantId,
              emailAccountId: account.id,
              ...snoozedWhere,
            },
            orderBy: { snoozedUntil: "asc" },
            take: HUB_SNOOZED_LIMIT,
            select: THREAD_SELECT,
          }),
          prisma.crmEmailThread.count({
            where: {
              tenantId: params.tenantId,
              emailAccountId: account.id,
              ...inboxWhere,
              isUnread: true,
            },
          }),
        ]);
        return {
          unread,
          rows: rows.map((row) => ({ ...row, accountEmail: account.email })),
          snoozed: snoozedRows.map((row) => ({ ...row, accountEmail: account.email })),
        };
      }),
    ),
    prisma.crmEmailOutbox.findMany({
      where: {
        tenantId: params.tenantId,
        userId: params.userId,
        status: "held",
        scheduledAt: { not: null },
      },
      orderBy: { scheduledAt: "asc" },
      take: HUB_SCHEDULED_LIMIT,
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        payload: true,
      },
    }),
  ]);

  const scheduled: HubScheduledItem[] = outboxRows.map((row) => {
    const payload = row.payload as EmailOutboxPayload;
    return {
      id: row.id,
      subject: payload.subject || "(Sin asunto)",
      to: Array.isArray(payload.to) ? payload.to : [],
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      status: row.status,
      threadId: payload.threadId ?? null,
    };
  });

  return {
    connected: true,
    accountEmails: accounts.map((a) => a.email),
    unreadCount: perAccount.reduce((acc, a) => acc + a.unread, 0),
    items: mergeHubEmailThreads(
      perAccount.flatMap((a) => a.rows),
      limit,
    ),
    snoozed: mergeHubSnoozedThreads(
      perAccount.flatMap((a) => a.snoozed),
      HUB_SNOOZED_LIMIT,
    ),
    scheduled,
  };
}
