import type { gmail_v1 } from "googleapis";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { flagsFromLabelIds } from "./gmail-thread-labels";
import { invalidateCorreoFolderCounts } from "./correos-folder-counts";

/** Cubre la ventana real del backfill histórico (after:2025/01/01), no 120d. */
const LOOKBACK_MS = 550 * 24 * 60 * 60 * 1000;
const CANDIDATE_CAP = 400;
/** Verificaciones remotas por corrida (API Gmail). El heal local no tiene este tope. */
const CHECK_CAP = 120;

function unionLabelIds(
  messages: Array<{ labelIds?: string[] | null }>,
): string[] {
  const all = new Set<string>();
  for (const m of messages) {
    for (const l of m.labelIds ?? []) all.add(l);
  }
  return Array.from(all);
}

function providerThreadScopeSql(providerThreadIds?: string[]): Prisma.Sql {
  if (!providerThreadIds || providerThreadIds.length === 0) return Prisma.empty;
  return Prisma.sql`AND t.provider_thread_id IN (${Prisma.join(
    providerThreadIds.map((id) => Prisma.sql`${id}`),
  )})`;
}

/**
 * Reparación instantánea (sin API Gmail): hilos con `archivedAt` seteado pero
 * cuyos mensajes locales aún tienen label `INBOX`. Es el residuo típico del
 * sweep viejo que archivaba en masa sin tocar `labelIds` de los mensajes.
 *
 * `providerThreadIds` acota a hilos tocados en la corrida (ids de Gmail).
 * Si se omite, barre toda la casilla.
 */
export async function healInboxFromLocalLabels(params: {
  tenantId: string;
  emailAccountId: string;
  /** Ids de Gmail (`provider_thread_id`). Omitir = toda la casilla. */
  providerThreadIds?: string[];
}): Promise<number> {
  const { tenantId, emailAccountId, providerThreadIds } = params;
  if (providerThreadIds && providerThreadIds.length === 0) return 0;

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT t.id
    FROM crm.email_threads t
    INNER JOIN crm.email_messages m ON m.thread_id = t.id
    WHERE t.tenant_id = ${tenantId}
      AND t.email_account_id = ${emailAccountId}::uuid
      AND t.archived_at IS NOT NULL
      AND t.trashed_at IS NULL
      AND t.spam_at IS NULL
      AND m.label_ids @> ARRAY['INBOX']::text[]
      ${providerThreadScopeSql(providerThreadIds)}
  `;
  if (rows.length === 0) return 0;
  const res = await prisma.crmEmailThread.updateMany({
    where: {
      tenantId,
      emailAccountId,
      id: { in: rows.map((r) => r.id) },
      archivedAt: { not: null },
      trashedAt: null,
      spamAt: null,
    },
    data: { archivedAt: null },
  });
  if (res.count > 0) invalidateCorreoFolderCounts(tenantId, emailAccountId);
  return res.count;
}

/**
 * Contraparte de healInboxFromLocalLabels: archiva los hilos SIN label INBOX
 * en ninguno de sus mensajes. Es el cierre del espejo — sin esto, todo hilo
 * importado por el backfill nace en Recibidos (archivedAt = NULL por default).
 *
 * Guardas:
 *  - solo hilos con al menos un mensaje que trae labels de Gmail (evita
 *    archivar hilos nativos del CRM: web4leads, seguimiento, envío CRM);
 *  - respeta papelera, spam y pospuestos vigentes;
 *  - `providerThreadIds` acota el alcance a los hilos tocados en la corrida.
 */
export async function archiveThreadsWithoutInboxLabel(params: {
  tenantId: string;
  emailAccountId: string;
  /** Si se omite, barre toda la casilla (reparación). */
  providerThreadIds?: string[];
}): Promise<number> {
  const { tenantId, emailAccountId, providerThreadIds } = params;
  if (providerThreadIds && providerThreadIds.length === 0) return 0;

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE crm.email_threads t
    SET archived_at = NOW(), updated_at = NOW()
    WHERE t.tenant_id = ${tenantId}
      AND t.email_account_id = ${emailAccountId}::uuid
      AND t.archived_at IS NULL
      AND t.trashed_at IS NULL
      AND t.spam_at IS NULL
      AND (t.snoozed_until IS NULL OR t.snoozed_until <= NOW())
      AND t.provider_thread_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM crm.email_messages m
        WHERE m.thread_id = t.id AND array_length(m.label_ids, 1) > 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM crm.email_messages m
        WHERE m.thread_id = t.id AND m.label_ids @> ARRAY['INBOX']::text[]
      )
      ${providerThreadScopeSql(providerThreadIds)}
    RETURNING t.id
  `;
  return rows.length;
}

/**
 * Espejo bidireccional desde labels locales: archivado↔inbox sin API Gmail.
 * Invocado tras cada página de backfill/incremental y por el endpoint de reparación.
 */
export async function syncThreadStateFromLocalLabels(params: {
  tenantId: string;
  emailAccountId: string;
  providerThreadIds?: string[];
}): Promise<{ toInbox: number; toArchive: number }> {
  const toInbox = await healInboxFromLocalLabels(params);
  const toArchive = await archiveThreadsWithoutInboxLabel(params);
  if (toInbox + toArchive > 0) {
    invalidateCorreoFolderCounts(params.tenantId, params.emailAccountId);
  }
  return { toInbox, toArchive };
}

/**
 * Self-heal de Recibidos: verificación positiva por-hilo contra Gmail.
 * No depende de sets globales ni de completitud — repara archivado erróneo
 * y archiva localmente lo que Gmail ya sacó de INBOX.
 *
 * Orden: (1) heal local bidireccional por labelIds, (2) chequeo remoto
 * priorizando archivados locales (restaurar a inbox).
 */
export async function selfHealInbox(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccountId: string;
  deadline: number;
}): Promise<{ healed: number; checked: number; localHealed: number }> {
  const { gmail, tenantId, emailAccountId, deadline } = params;

  // Capturar ids restaurados localmente para re-verificarlos primero contra
  // Gmail (labels locales pueden estar stale → evitar falso-inbox).
  const localCandidates = await prisma.$queryRaw<{ id: string; provider_thread_id: string | null }[]>`
    SELECT t.id, t.provider_thread_id
    FROM crm.email_threads t
    WHERE t.tenant_id = ${tenantId}
      AND t.email_account_id = ${emailAccountId}::uuid
      AND t.archived_at IS NOT NULL
      AND t.trashed_at IS NULL
      AND t.spam_at IS NULL
      AND EXISTS (
        SELECT 1 FROM crm.email_messages m
        WHERE m.thread_id = t.id AND m.label_ids @> ARRAY['INBOX']::text[]
      )
    ORDER BY t.last_message_at DESC NULLS LAST
    LIMIT ${CANDIDATE_CAP}
  `;
  const localSync = await syncThreadStateFromLocalLabels({ tenantId, emailAccountId });
  const localHealed = localSync.toInbox + localSync.toArchive;

  const since = new Date(Date.now() - LOOKBACK_MS);
  const base = { tenantId, emailAccountId, trashedAt: null, spamAt: null };

  // Priorizar: (1) recién restaurados locales → confirmar INBOX en Gmail,
  // (2) archivados restantes, (3) inbox local que podría necesitar archivar.
  const localIds = new Set(localCandidates.map((t) => t.id));
  const [archived, inInbox] = await Promise.all([
    prisma.crmEmailThread.findMany({
      where: { ...base, archivedAt: { not: null }, lastMessageAt: { gte: since } },
      select: { id: true, providerThreadId: true },
      orderBy: { lastMessageAt: "desc" },
      take: CANDIDATE_CAP,
    }),
    prisma.crmEmailThread.findMany({
      where: {
        ...base,
        archivedAt: null,
        // Pospuestos salen de INBOX a propósito: no archivarlos por self-heal.
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }],
        lastMessageAt: { gte: since },
        ...(localIds.size > 0 ? { id: { notIn: Array.from(localIds) } } : {}),
      },
      select: { id: true, providerThreadId: true },
      orderBy: { lastMessageAt: "desc" },
      take: Math.min(CANDIDATE_CAP, 80),
    }),
  ]);

  type Expect = "inbox" | "archive" | "confirm";
  const candidates: Array<{ id: string; providerThreadId: string | null; expect: Expect }> = [
    // confirm: recién restaurados por labels locales — si Gmail ya no tiene
    // INBOX, re-archivar (labels stale).
    ...localCandidates.map((t) => ({
      id: t.id,
      providerThreadId: t.provider_thread_id,
      expect: "confirm" as const,
    })),
    ...archived
      .filter((t) => !localIds.has(t.id))
      .map((t) => ({ ...t, expect: "inbox" as const })),
    ...inInbox.map((t) => ({ ...t, expect: "archive" as const })),
  ].slice(0, CHECK_CAP);

  let healed = localHealed;
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
        (t.expect === "archive" || t.expect === "confirm") &&
        !flags.inInbox &&
        !flags.inTrash &&
        !flags.inSpam
      ) {
        toArchive.push(t.id);
      }
      // confirm + aún en INBOX: no-op (ya restaurado localmente).
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
      where: {
        tenantId,
        emailAccountId,
        id: { in: toArchive },
        // No pisar pospuestos vigentes (snooze ≠ archive).
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      },
      data: { archivedAt: now, trashedAt: null, spamAt: null },
    });
    healed += r.count;
  }
  if (healed > localHealed) invalidateCorreoFolderCounts(tenantId, emailAccountId);
  return { healed, checked, localHealed };
}
