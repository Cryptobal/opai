import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { gmailClientForAccount } from "./gmail-account-client";
import { applyThreadLabelFlags } from "./gmail-thread-labels";

export type CorreoAction = "archive" | "unarchive" | "trash" | "markRead" | "markUnread";

/**
 * Ejecuta una acción de bandeja contra Gmail y SOLO entonces persiste local.
 * trash = Papelera (recuperable); nunca delete permanente.
 */
export async function runCorreoThreadAction(params: {
  tenantId: string;
  userId: string;
  threadId: string;
  action: CorreoAction;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: params.threadId, tenantId: params.tenantId },
    select: { id: true, emailAccountId: true, providerThreadId: true },
  });
  if (!thread?.emailAccountId || !thread.providerThreadId) {
    return { ok: false, error: "Hilo no vinculado a Gmail", status: 400 };
  }

  const account = await prisma.crmEmailAccount.findFirst({
    where: {
      id: thread.emailAccountId,
      tenantId: params.tenantId,
      userId: params.userId,
      status: "active",
    },
  });
  if (!account) return { ok: false, error: "Forbidden", status: 403 };

  const gmail = gmailClientForAccount(account);
  if (!gmail) return { ok: false, error: "Gmail no conectado", status: 400 };

  const tid = thread.providerThreadId;
  try {
    if (params.action === "trash") {
      await gmail.users.threads.trash({ userId: "me", id: tid });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { trashedAt: new Date(), archivedAt: null },
      });
      return { ok: true };
    }
    if (params.action === "archive") {
      await gmail.users.threads.modify({
        userId: "me",
        id: tid,
        requestBody: { removeLabelIds: ["INBOX"] },
      });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { archivedAt: new Date() },
      });
      return { ok: true };
    }
    if (params.action === "unarchive") {
      await gmail.users.threads.modify({
        userId: "me",
        id: tid,
        requestBody: { addLabelIds: ["INBOX"] },
      });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { archivedAt: null },
      });
      return { ok: true };
    }
    if (params.action === "markRead") {
      await gmail.users.threads.modify({
        userId: "me",
        id: tid,
        requestBody: { removeLabelIds: ["UNREAD"] },
      });
      await prisma.crmEmailThread.update({
        where: { id: thread.id },
        data: { isUnread: false },
      });
      return { ok: true };
    }
    await gmail.users.threads.modify({
      userId: "me",
      id: tid,
      requestBody: { addLabelIds: ["UNREAD"] },
    });
    await prisma.crmEmailThread.update({
      where: { id: thread.id },
      data: { isUnread: true },
    });
    return { ok: true };
  } catch (err) {
    console.error("[gmail] thread action failed:", params.action, err);
    return { ok: false, error: "Gmail rechazó la acción", status: 502 };
  }
}

/** Refresca flags locales leyendo el hilo en Gmail. */
export async function refreshThreadLabelsFromGmail(params: {
  gmail: gmail_v1.Gmail;
  tenantId: string;
  emailAccountId: string;
  providerThreadId: string;
}): Promise<void> {
  try {
    const res = await params.gmail.users.threads.get({
      userId: "me",
      id: params.providerThreadId,
      format: "minimal",
    });
    const all = new Set<string>();
    for (const m of res.data.messages ?? []) {
      for (const l of m.labelIds ?? []) all.add(l);
    }
    await applyThreadLabelFlags({
      tenantId: params.tenantId,
      emailAccountId: params.emailAccountId,
      providerThreadId: params.providerThreadId,
      labelIds: Array.from(all),
    });
  } catch (err) {
    console.error("[gmail] refreshThreadLabelsFromGmail:", err);
  }
}
