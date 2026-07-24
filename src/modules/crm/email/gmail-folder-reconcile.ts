import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { applyThreadLabelFlags } from "./gmail-thread-labels";
import { upsertGmailMessage } from "./gmail-message-upsert";
import { listGmailThreadIdSet } from "./gmail-folder-reconcile-sets";
import { invalidateCorreoFolderCounts } from "./correos-folder-counts";
import type { EmailAccountLite } from "./gmail-sync-state";

const TRASH_IMPORT_CAP = 25;
const INBOX_IMPORT_CAP = 50;

/**
 * Sweep global degradado: aplica pertenencia positiva a sets (refuerzo) e
 * importa hilos que existen en Gmail pero no localmente — INBOX primero
 * (hilos perdidos en ventanas muertas del historyId que jamás entrarían a
 * Recibidos), luego TRASH/SPAM. El estado inbox/archivado por-hilo lo
 * resuelven el incremental + self-heal — aquí NO se archiva.
 */
export async function reconcileGmailFolders(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccount: EmailAccountLite;
  deadline: number;
}): Promise<{ updated: number; importedTrash: number; importedInbox: number; complete: boolean }> {
  const { gmail, tenantId, emailAccount, deadline } = params;
  try {
    // INBOX: más páginas para reforzar pertenencia positiva (self-heal cubre el resto).
    // 10×500 ≈ hasta ~5k mensajes; `complete` sigue indicando si el set quedó parcial.
    const inboxSet = await listGmailThreadIdSet({ gmail, labelId: "INBOX", maxPages: 10, deadline });
    const trashSet = await listGmailThreadIdSet({ gmail, labelId: "TRASH", maxPages: 4, deadline });
    const spamSet = await listGmailThreadIdSet({ gmail, labelId: "SPAM", maxPages: 2, deadline });
    const setsComplete = inboxSet.complete && spamSet.complete && trashSet.complete;

    const threads = await prisma.crmEmailThread.findMany({
      where: { tenantId, emailAccountId: emailAccount.id, providerThreadId: { not: null } },
      select: {
        id: true, providerThreadId: true, archivedAt: true, trashedAt: true, spamAt: true,
      },
    });

    const toInbox: string[] = [];
    const toSpam: string[] = [];
    const toTrash: string[] = [];
    const localIds = new Set<string>();
    for (const t of threads) {
      const tid = t.providerThreadId as string;
      localIds.add(tid);
      // Solo pertenencia positiva (confiable aun con sets parciales).
      if (inboxSet.ids.has(tid)) {
        if (t.archivedAt || t.trashedAt || t.spamAt) toInbox.push(t.id);
      } else if (spamSet.ids.has(tid)) {
        if (!t.spamAt || t.trashedAt || t.archivedAt) toSpam.push(t.id);
      } else if (trashSet.ids.has(tid)) {
        if (!t.trashedAt || t.spamAt || t.archivedAt) toTrash.push(t.id);
      }
    }

    const now = new Date();
    const base = { tenantId, emailAccountId: emailAccount.id };
    const groups: Array<[string[], { archivedAt: Date | null; trashedAt: Date | null; spamAt: Date | null }]> = [
      [toInbox, { archivedAt: null, trashedAt: null, spamAt: null }],
      [toSpam, { archivedAt: null, trashedAt: null, spamAt: now }],
      [toTrash, { archivedAt: null, trashedAt: now, spamAt: null }],
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

    // INBOX primero (lo que el usuario ve en Recibidos), papelera después.
    const inboxMissing = Array.from(inboxSet.ids).filter((tid) => !localIds.has(tid));
    const trashMissing = Array.from(trashSet.ids).filter((tid) => !localIds.has(tid));
    const inboxImport = await importMissingThreads({
      gmail,
      tenantId,
      emailAccount,
      deadline,
      threadIds: inboxMissing,
      cap: INBOX_IMPORT_CAP,
    });
    const trashImport = await importMissingThreads({
      gmail,
      tenantId,
      emailAccount,
      deadline,
      threadIds: trashMissing,
      cap: TRASH_IMPORT_CAP,
    });

    invalidateCorreoFolderCounts(tenantId, emailAccount.id);
    // complete=false si quedaron imports pendientes por deadline/cap: si no,
    // el throttle de 10 min deja el espejo INBOX agujereado con historyId al día.
    const importsDone = inboxImport.remaining === 0 && trashImport.remaining === 0;
    return {
      updated,
      importedTrash: trashImport.imported,
      importedInbox: inboxImport.imported,
      complete: setsComplete && importsDone,
    };
  } catch (err) {
    console.warn("[gmail] reconcileGmailFolders:", err);
    return { updated: 0, importedTrash: 0, importedInbox: 0, complete: false };
  }
}

/**
 * Importa hilos que existen en Gmail pero no localmente (INBOX o TRASH):
 * upsert del último mensaje + flags del hilo (unión de labels). Los hilos
 * INBOX perdidos en ventanas muertas del historyId no tienen otra vía de
 * entrada — el incremental solo ve cambios nuevos.
 */
async function importMissingThreads(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccount: EmailAccountLite;
  deadline: number;
  threadIds: string[];
  cap: number;
}): Promise<{ imported: number; remaining: number }> {
  const { gmail, tenantId, emailAccount, deadline } = params;
  const queue = params.threadIds.slice(0, params.cap);
  let imported = 0;
  for (const tid of queue) {
    if (Date.now() >= deadline) {
      return { imported, remaining: queue.length - imported };
    }
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
      console.warn("[gmail] importMissingThreads:", tid, err);
    }
  }
  // Candidatos fuera del cap siguen pendientes para la próxima corrida.
  const remaining = Math.max(params.threadIds.length - imported, 0);
  return { imported, remaining };
}

/**
 * Reparación barata del espejo Recibidos: 1–2 páginas de INBOX de Gmail e
 * importa los hilos que faltan localmente. Se corre en CADA maintenance
 * (aunque el sweep completo esté en throttle) porque el incremental +
 * historyId al día NO recupera hilos perdidos en ventanas muertas.
 */
export async function repairMissingInboxThreads(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccount: EmailAccountLite;
  deadline: number;
  /** Páginas de messages.list (500/msg). Default 2 ≈ hasta 1k hilos INBOX. */
  maxPages?: number;
  cap?: number;
}): Promise<{ imported: number; missing: number; complete: boolean }> {
  const { gmail, tenantId, emailAccount, deadline } = params;
  try {
    const inboxSet = await listGmailThreadIdSet({
      gmail,
      labelId: "INBOX",
      maxPages: params.maxPages ?? 2,
      deadline,
    });
    if (inboxSet.ids.size === 0) {
      return { imported: 0, missing: 0, complete: inboxSet.complete };
    }
    const local = await prisma.crmEmailThread.findMany({
      where: {
        tenantId,
        emailAccountId: emailAccount.id,
        providerThreadId: { in: Array.from(inboxSet.ids) },
      },
      select: { providerThreadId: true },
    });
    const localIds = new Set(local.map((t) => t.providerThreadId as string));
    const missingIds = Array.from(inboxSet.ids).filter((tid) => !localIds.has(tid));
    if (missingIds.length === 0) {
      return { imported: 0, missing: 0, complete: inboxSet.complete };
    }
    const { imported, remaining } = await importMissingThreads({
      gmail,
      tenantId,
      emailAccount,
      deadline,
      threadIds: missingIds,
      cap: params.cap ?? INBOX_IMPORT_CAP,
    });
    if (imported > 0) invalidateCorreoFolderCounts(tenantId, emailAccount.id);
    return {
      imported,
      missing: missingIds.length,
      complete: inboxSet.complete && remaining === 0,
    };
  } catch (err) {
    console.warn("[gmail] repairMissingInboxThreads:", err);
    return { imported: 0, missing: 0, complete: false };
  }
}
