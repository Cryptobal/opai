/**
 * Correos recientes para el Hub — consulta compacta sobre la base LOCAL
 * sincronizada (CrmEmailThread). NUNCA llama a Gmail: solo lee metadatos ya
 * persistidos (asunto, remitente, snippet, unread, adjuntos, fecha).
 *
 * Privacidad: solo casillas activas del usuario de sesión (userId), con
 * tenant scoping obligatorio. Leer esta lista no modifica `isUnread`.
 */

import { prisma } from "@/lib/prisma";
import { folderWhere } from "./correos-list";
import { snippetFromBody } from "./correos-list-helpers";

export const HUB_RECENT_EMAILS_LIMIT = 5;
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
};

export type HubRecentEmails = {
  connected: boolean;
  /** Casillas activas del usuario (para mostrar identidad si hay >1). */
  accountEmails: string[];
  unreadCount: number;
  items: HubEmailItem[];
};

type ThreadRow = {
  id: string;
  subject: string;
  lastMessageAt: Date | null;
  isUnread: boolean;
  attachmentCount: number;
  providerThreadId: string | null;
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
  return deduped.slice(0, Math.max(1, limit)).map((row) => ({
    id: row.id,
    subject: row.subject,
    fromEmail: row.messages[0]?.fromEmail ?? null,
    snippet: shortSnippet(row),
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    isUnread: row.isUnread,
    hasAttachment: row.attachmentCount > 0,
    accountEmail: row.accountEmail,
  }));
}

/** Correos recientes del usuario de sesión (solo lectura, base local). */
export async function getHubRecentEmails(params: {
  tenantId: string;
  userId: string;
  limit?: number;
}): Promise<HubRecentEmails> {
  const limit = Math.min(Math.max(params.limit ?? HUB_RECENT_EMAILS_LIMIT, 1), HUB_RECENT_EMAILS_LIMIT);

  // Solo casillas ACTIVAS del usuario de sesión — una casilla desconectada o
  // revocada (status != active) jamás se consulta.
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
    return { connected: false, accountEmails: [], unreadCount: 0, items: [] };
  }

  const inboxWhere = folderWhere("inbox");

  const perAccount = await Promise.all(
    accounts.map(async (account) => {
      const [rows, unread] = await Promise.all([
        prisma.crmEmailThread.findMany({
          where: {
            tenantId: params.tenantId,
            emailAccountId: account.id,
            ...inboxWhere,
          },
          // No leídos recientes primero, luego leídos recientes — orden
          // predecible, sin re-ranking por clasificaciones de Radar.
          orderBy: [{ isUnread: "desc" }, { lastMessageAt: "desc" }],
          take: limit,
          select: {
            id: true,
            subject: true,
            lastMessageAt: true,
            isUnread: true,
            attachmentCount: true,
            providerThreadId: true,
            messages: {
              select: { fromEmail: true, textBody: true, htmlBody: true },
              orderBy: { sentAt: "desc" },
              take: 1,
            },
          },
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
      };
    }),
  );

  return {
    connected: true,
    accountEmails: accounts.map((a) => a.email),
    unreadCount: perAccount.reduce((acc, a) => acc + a.unread, 0),
    items: mergeHubEmailThreads(
      perAccount.flatMap((a) => a.rows),
      limit,
    ),
  };
}
