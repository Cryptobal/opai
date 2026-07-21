import { prisma } from "@/lib/prisma";
import { runCorreoThreadAction } from "./gmail-thread-actions";

const WAKE_CAP = 50;

/**
 * Despierta los hilos pospuestos cuyo snooze venció (cap 50): los devuelve a
 * INBOX en Gmail y a Recibidos en OPAI, marcados no leídos para que destaquen.
 * Pensado como paso inicial del cron de sync. Best-effort: un fallo por hilo no
 * corta el resto; un hilo no vinculable limpia su snooze para no reintentar en
 * bucle (un fallo transitorio se reintenta en la próxima corrida).
 */
export async function wakeSnoozedThreads(now: Date = new Date()): Promise<number> {
  const due = await prisma.crmEmailThread.findMany({
    where: { snoozedUntil: { not: null, lte: now }, trashedAt: null },
    select: { id: true, tenantId: true, emailAccountId: true },
    orderBy: { snoozedUntil: "asc" },
    take: WAKE_CAP,
  });
  if (due.length === 0) return 0;

  const accountIds = Array.from(
    new Set(due.map((t) => t.emailAccountId).filter(Boolean) as string[]),
  );
  const accounts = await prisma.crmEmailAccount.findMany({
    where: { id: { in: accountIds }, status: "active" },
    select: { id: true, userId: true },
  });
  const userByAccount = new Map(accounts.map((a) => [a.id, a.userId]));

  let woke = 0;
  for (const t of due) {
    const userId = t.emailAccountId ? userByAccount.get(t.emailAccountId) : null;
    if (!userId) {
      await prisma.crmEmailThread
        .update({ where: { id: t.id }, data: { snoozedUntil: null } })
        .catch(() => {});
      continue;
    }
    const res = await runCorreoThreadAction({
      tenantId: t.tenantId,
      userId,
      threadId: t.id,
      action: "unsnooze",
    });
    if (res.ok) {
      await prisma.crmEmailThread
        .update({ where: { id: t.id }, data: { isUnread: true } })
        .catch(() => {});
      woke++;
    } else if (res.status === 400) {
      // Hilo no vinculable a Gmail: limpia el snooze para no reintentar en bucle.
      await prisma.crmEmailThread
        .update({ where: { id: t.id }, data: { snoozedUntil: null } })
        .catch(() => {});
    }
  }
  return woke;
}
