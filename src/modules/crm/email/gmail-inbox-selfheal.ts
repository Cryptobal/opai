import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { flagsFromLabelIds } from "./gmail-thread-labels";
import { invalidateCorreoFolderCounts } from "./correos-folder-counts";

const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const CANDIDATE_CAP = 200;
const CHECK_CAP = 60;

function unionLabelIds(
  messages: Array<{ labelIds?: string[] | null }>,
): string[] {
  const all = new Set<string>();
  for (const m of messages) {
    for (const l of m.labelIds ?? []) all.add(l);
  }
  return Array.from(all);
}

/**
 * Self-heal de Recibidos: verificación positiva por-hilo contra Gmail.
 * No depende de sets globales ni de completitud — repara archivado erróneo
 * y archiva localmente lo que Gmail ya sacó de INBOX.
 */
export async function selfHealInbox(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccountId: string;
  deadline: number;
}): Promise<{ healed: number; checked: number }> {
  const { gmail, tenantId, emailAccountId, deadline } = params;
  const since = new Date(Date.now() - LOOKBACK_MS);
  const base = { tenantId, emailAccountId, trashedAt: null, spamAt: null };

  const [archived, inInbox] = await Promise.all([
    prisma.crmEmailThread.findMany({
      where: { ...base, archivedAt: { not: null }, lastMessageAt: { gte: since } },
      select: { id: true, providerThreadId: true },
      orderBy: { lastMessageAt: "desc" },
      take: CANDIDATE_CAP,
    }),
    prisma.crmEmailThread.findMany({
      where: { ...base, archivedAt: null, lastMessageAt: { gte: since } },
      select: { id: true, providerThreadId: true },
      orderBy: { lastMessageAt: "desc" },
      take: CANDIDATE_CAP,
    }),
  ]);

  const candidates = [
    ...archived.map((t) => ({ ...t, expect: "inbox" as const })),
    ...inInbox.map((t) => ({ ...t, expect: "archive" as const })),
  ].slice(0, CHECK_CAP);

  let healed = 0;
  let checked = 0;
  const toInbox: string[] = [];
  const toArchive: string[] = [];

  for (const t of candidates) {
    if (Date.now() >= deadline) break;
    if (!t.providerThreadId) continue;
    checked += 1;
    try {
      const res = await gmail.users.threads.get({
        userId: "me",
        id: t.providerThreadId,
        format: "minimal",
      });
      const flags = flagsFromLabelIds(unionLabelIds(res.data.messages ?? []));
      if (t.expect === "inbox" && flags.inInbox) toInbox.push(t.id);
      if (
        t.expect === "archive" &&
        !flags.inInbox &&
        !flags.inTrash &&
        !flags.inSpam
      ) {
        toArchive.push(t.id);
      }
    } catch (err) {
      const e = err as { code?: number; status?: number; response?: { status?: number } };
      const status = e?.code ?? e?.status ?? e?.response?.status;
      if (status !== 404) {
        console.warn("[gmail] selfHealInbox:", t.providerThreadId, err);
      }
      // 404: no archivar desde aquí (refreshThreadLabelsFromGmail ya lo maneja).
    }
  }

  const now = new Date();
  if (toInbox.length > 0) {
    const r = await prisma.crmEmailThread.updateMany({
      where: { tenantId, emailAccountId, id: { in: toInbox } },
      data: { archivedAt: null },
    });
    healed += r.count;
  }
  if (toArchive.length > 0) {
    const r = await prisma.crmEmailThread.updateMany({
      where: { tenantId, emailAccountId, id: { in: toArchive } },
      data: { archivedAt: now, trashedAt: null, spamAt: null },
    });
    healed += r.count;
  }
  if (healed > 0) invalidateCorreoFolderCounts(tenantId, emailAccountId);
  return { healed, checked };
}
