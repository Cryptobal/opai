import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { applyThreadLabelFlags } from "./gmail-thread-labels";
import { upsertGmailMessage } from "./gmail-message-upsert";
import { listGmailThreadIdSet } from "./gmail-folder-reconcile-sets";
import { invalidateCorreoFolderCounts } from "./correos-folder-counts";
import type { EmailAccountLite } from "./gmail-sync-state";

const TRASH_IMPORT_CAP = 25;

/**
 * Sweep de reconciliación total contra Gmail: clasifica cada hilo local según
 * los sets reales de INBOX/SPAM/TRASH (prioridad INBOX > SPAM > TRASH >
 * archivado) e importa hilos de papelera que nunca llegaron (backfill los
 * excluye por diseño). Best-effort: nunca lanza hacia el caller.
 */
export async function reconcileGmailFolders(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccount: EmailAccountLite;
  deadline: number;
}): Promise<{ updated: number; importedTrash: number; complete: boolean }> {
  const { gmail, tenantId, emailAccount, deadline } = params;
  try {
    const inboxSet = await listGmailThreadIdSet({ gmail, labelId: "INBOX", maxPages: 6, deadline });
    const trashSet = await listGmailThreadIdSet({ gmail, labelId: "TRASH", maxPages: 4, deadline });
    const spamSet = await listGmailThreadIdSet({ gmail, labelId: "SPAM", maxPages: 2, deadline });
    // Un set parcial (corte por deadline/maxPages) sigue sirviendo para la
    // clasificación positiva, pero la AUSENCIA en él no prueba nada: el
    // bucket residual "resto → archivado" solo es válido con los 3 completos.
    const setsComplete = inboxSet.complete && spamSet.complete && trashSet.complete;
    if (!setsComplete) {
      console.warn("[gmail] sweep parcial — se omite archivado residual", {
        emailAccountId: emailAccount.id,
        inbox: inboxSet.complete,
        spam: spamSet.complete,
        trash: trashSet.complete,
      });
    }

    const threads = await prisma.crmEmailThread.findMany({
      where: { tenantId, emailAccountId: emailAccount.id, providerThreadId: { not: null } },
      select: {
        id: true, providerThreadId: true, archivedAt: true, trashedAt: true,
        spamAt: true, snoozedUntil: true,
      },
    });

    const nowTs = Date.now();
    const toInbox: string[] = [];
    const toSpam: string[] = [];
    const toTrash: string[] = [];
    const toArchived: string[] = [];
    const localIds = new Set<string>();
    for (const t of threads) {
      const tid = t.providerThreadId as string;
      localIds.add(tid);
      // Snooze es estado LOCAL: un pospuesto vigente no está en INBOX de Gmail y
      // eso es consistente — no lo archives residualmente ni lo toques.
      const snoozed = t.snoozedUntil ? t.snoozedUntil.getTime() > nowTs : false;
      if (inboxSet.ids.has(tid)) {
        if (t.archivedAt || t.trashedAt || t.spamAt) toInbox.push(t.id);
      } else if (spamSet.ids.has(tid)) {
        if (!t.spamAt || t.trashedAt || t.archivedAt) toSpam.push(t.id);
      } else if (trashSet.ids.has(tid)) {
        if (!t.trashedAt || t.spamAt || t.archivedAt) toTrash.push(t.id);
      } else if (setsComplete && !snoozed && (!t.archivedAt || t.trashedAt || t.spamAt)) {
        toArchived.push(t.id);
      }
    }

    const now = new Date();
    const base = { tenantId, emailAccountId: emailAccount.id };
    const groups: Array<[string[], { archivedAt: Date | null; trashedAt: Date | null; spamAt: Date | null }]> = [
      [toInbox, { archivedAt: null, trashedAt: null, spamAt: null }],
      [toSpam, { archivedAt: null, trashedAt: null, spamAt: now }],
      [toTrash, { archivedAt: null, trashedAt: now, spamAt: null }],
      [toArchived, { archivedAt: now, trashedAt: null, spamAt: null }],
    ];
    let updated = 0;
    for (const [ids, data] of groups) {
      if (ids.length === 0) continue;
      const res = await prisma.crmEmailThread.updateMany({
        where: { ...base, id: { in: ids } },
        data,
      });
      updated += res.count;
    }

    const importedTrash = await importMissingTrashThreads({
      gmail,
      tenantId,
      emailAccount,
      deadline,
      threadIds: Array.from(trashSet.ids).filter((tid) => !localIds.has(tid)),
    });

    invalidateCorreoFolderCounts(tenantId, emailAccount.id);
    return { updated, importedTrash, complete: setsComplete };
  } catch (err) {
    console.warn("[gmail] reconcileGmailFolders:", err);
    return { updated: 0, importedTrash: 0, complete: false };
  }
}

/**
 * Importa hilos que solo existen en la papelera de Gmail (cap 25/corrida):
 * upsert del último mensaje + flags del hilo (unión de labels) → Papelera.
 */
async function importMissingTrashThreads(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccount: EmailAccountLite;
  deadline: number;
  threadIds: string[];
}): Promise<number> {
  const { gmail, tenantId, emailAccount, deadline } = params;
  let imported = 0;
  for (const tid of params.threadIds.slice(0, TRASH_IMPORT_CAP)) {
    if (Date.now() >= deadline) break;
    try {
      const res = await gmail.users.threads.get({ userId: "me", id: tid, format: "metadata" });
      const messages = res.data.messages ?? [];
      const last = messages[messages.length - 1];
      if (!last?.id) continue;
      await upsertGmailMessage({ gmail, tenantId, emailAccount, messageId: last.id });
      const all = new Set<string>();
      for (const m of messages) {
        for (const l of m.labelIds ?? []) all.add(l);
      }
      await applyThreadLabelFlags({
        tenantId,
        emailAccountId: emailAccount.id,
        providerThreadId: tid,
        labelIds: Array.from(all),
      });
      imported += 1;
    } catch (err) {
      console.warn("[gmail] importMissingTrashThreads:", tid, err);
    }
  }
  return imported;
}
