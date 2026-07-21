import { prisma } from "@/lib/prisma";

/** Flags crudos derivados de la unión de labels de TODOS los mensajes del hilo. */
export function flagsFromLabelIds(labelIds: string[] | null | undefined) {
  const labels = labelIds ?? [];
  return {
    inInbox: labels.includes("INBOX"),
    inSpam: labels.includes("SPAM"),
    inTrash: labels.includes("TRASH"),
    isUnread: labels.includes("UNREAD"),
  };
}

type ThreadStateFields = {
  archivedAt: Date | null;
  trashedAt: Date | null;
  spamAt: Date | null;
};

/**
 * Semántica de hilo Gmail (labels = unión de todos los mensajes).
 * Prioridad: INBOX > SPAM > TRASH > archivado. Conserva timestamps ya
 * seteados (no los pisa con un `now` nuevo si el estado no cambió).
 */
export function deriveThreadState(
  flags: ReturnType<typeof flagsFromLabelIds>,
  current: ThreadStateFields,
  now = new Date(),
): ThreadStateFields {
  if (flags.inInbox) return { archivedAt: null, trashedAt: null, spamAt: null };
  if (flags.inSpam) return { archivedAt: null, trashedAt: null, spamAt: current.spamAt ?? now };
  if (flags.inTrash) return { archivedAt: null, trashedAt: current.trashedAt ?? now, spamAt: null };
  return { archivedAt: current.archivedAt ?? now, trashedAt: null, spamAt: null };
}

/** Persiste espejo local de labels del hilo (INBOX / SPAM / TRASH / UNREAD). */
export async function applyThreadLabelFlags(params: {
  tenantId: string;
  emailAccountId: string;
  providerThreadId: string;
  labelIds: string[] | null | undefined;
}): Promise<void> {
  const flags = flagsFromLabelIds(params.labelIds);
  const where = {
    tenantId: params.tenantId,
    emailAccountId: params.emailAccountId,
    providerThreadId: params.providerThreadId,
  };
  const current = await prisma.crmEmailThread.findFirst({
    where,
    select: { archivedAt: true, trashedAt: true, spamAt: true, isUnread: true },
  });
  if (!current) return;

  const next = deriveThreadState(flags, current);
  const data: Partial<ThreadStateFields & { isUnread: boolean }> = {};
  if ((next.archivedAt?.getTime() ?? null) !== (current.archivedAt?.getTime() ?? null)) {
    data.archivedAt = next.archivedAt;
  }
  if ((next.trashedAt?.getTime() ?? null) !== (current.trashedAt?.getTime() ?? null)) {
    data.trashedAt = next.trashedAt;
  }
  if ((next.spamAt?.getTime() ?? null) !== (current.spamAt?.getTime() ?? null)) {
    data.spamAt = next.spamAt;
  }
  if (flags.isUnread !== current.isUnread) data.isUnread = flags.isUnread;
  if (Object.keys(data).length === 0) return;

  await prisma.crmEmailThread.updateMany({ where, data });
}

/**
 * Deriva el estado del hilo desde los `labelIds` ya persistidos en sus
 * mensajes locales (unión). Si no hay labels (backfill viejo), no toca —
 * deja que el refresh remoto los pueble.
 */
export async function deriveThreadStateFromMessages(
  tenantId: string,
  emailAccountId: string,
  providerThreadId: string,
): Promise<void> {
  const messages = await prisma.crmEmailMessage.findMany({
    where: {
      tenantId,
      emailAccountId,
      thread: { providerThreadId },
    },
    select: { labelIds: true },
  });
  if (messages.length === 0) return;
  const all = new Set<string>();
  for (const m of messages) {
    for (const l of m.labelIds) all.add(l);
  }
  if (all.size === 0) return;

  await applyThreadLabelFlags({
    tenantId,
    emailAccountId,
    providerThreadId,
    labelIds: Array.from(all),
  });
}
