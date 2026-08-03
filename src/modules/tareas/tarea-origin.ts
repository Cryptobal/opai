/**
 * Enriquecimiento de origen para DTOs de tarea (asunto correo / cuenta / negocio /
 * cotización / instalación). Batch scoped por tenant — patrón accMap/dealMap.
 */

import { prisma } from "@/lib/prisma";

export type TaskOriginFields = {
  emailThreadSubject: string | null;
  accountName: string | null;
  dealTitle: string | null;
  quoteLabel: string | null;
  installationName: string | null;
};

export const EMPTY_ORIGIN: TaskOriginFields = {
  emailThreadSubject: null,
  accountName: null,
  dealTitle: null,
  quoteLabel: null,
  installationName: null,
};

type OriginIds = {
  emailThreadId?: string | null;
  accountId?: string | null;
  dealId?: string | null;
  quoteId?: string | null;
  installationId?: string | null;
};

/** Mapas batch por ids recolectados. Todos filtrados por tenantId. */
export async function loadTaskOriginMaps(
  tenantId: string,
  items: OriginIds[],
): Promise<{
  subjectMap: Map<string, string>;
  accountMap: Map<string, string>;
  dealMap: Map<string, string>;
  quoteMap: Map<string, string>;
  installationMap: Map<string, string>;
}> {
  const threadIds = [...new Set(items.map((i) => i.emailThreadId).filter(Boolean))] as string[];
  const accountIds = [...new Set(items.map((i) => i.accountId).filter(Boolean))] as string[];
  const dealIds = [...new Set(items.map((i) => i.dealId).filter(Boolean))] as string[];
  const quoteIds = [...new Set(items.map((i) => i.quoteId).filter(Boolean))] as string[];
  const installationIds = [...new Set(items.map((i) => i.installationId).filter(Boolean))] as string[];

  const [threads, accounts, deals, quotes, installations] = await Promise.all([
    threadIds.length
      ? prisma.crmEmailThread.findMany({
          where: { tenantId, id: { in: threadIds } },
          select: { id: true, subject: true },
        })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.crmAccount.findMany({
          where: { tenantId, id: { in: accountIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    dealIds.length
      ? prisma.crmDeal.findMany({
          where: { tenantId, id: { in: dealIds } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    quoteIds.length
      ? prisma.cpqQuote.findMany({
          where: { tenantId, id: { in: quoteIds } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    installationIds.length
      ? prisma.crmInstallation.findMany({
          where: { tenantId, id: { in: installationIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    subjectMap: new Map(threads.map((t) => [t.id, t.subject ?? ""])),
    accountMap: new Map(accounts.map((a) => [a.id, a.name])),
    dealMap: new Map(deals.map((d) => [d.id, d.title])),
    quoteMap: new Map(
      quotes.map((q) => [q.id, q.name?.trim() ? `${q.code} · ${q.name}` : q.code]),
    ),
    installationMap: new Map(installations.map((i) => [i.id, i.name])),
  };
}

export function originFromMaps(
  item: OriginIds,
  maps: Awaited<ReturnType<typeof loadTaskOriginMaps>>,
): TaskOriginFields {
  return {
    emailThreadSubject: item.emailThreadId
      ? maps.subjectMap.get(item.emailThreadId) ?? null
      : null,
    accountName: item.accountId ? maps.accountMap.get(item.accountId) ?? null : null,
    dealTitle: item.dealId ? maps.dealMap.get(item.dealId) ?? null : null,
    quoteLabel: item.quoteId ? maps.quoteMap.get(item.quoteId) ?? null : null,
    installationName: item.installationId
      ? maps.installationMap.get(item.installationId) ?? null
      : null,
  };
}

export const TASK_PRIORITIES = ["high", "medium", "low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Valida priority: high|medium|low|null. Devuelve `{ ok, value }` o `{ ok:false }`. */
export function parsePriority(raw: unknown): { ok: true; value: TaskPriority | null } | { ok: false } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  if (raw === "high" || raw === "medium" || raw === "low") return { ok: true, value: raw };
  return { ok: false };
}
