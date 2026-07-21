import { prisma } from "@/lib/prisma";

/** Deriva flags locales desde labelIds de un hilo Gmail. */
export function flagsFromLabelIds(labelIds: string[] | null | undefined) {
  const labels = labelIds ?? [];
  const trashed = labels.includes("TRASH");
  const inInbox = labels.includes("INBOX");
  return {
    trashedAt: trashed ? new Date() : null,
    archivedAt: !trashed && !inInbox ? new Date() : null,
    isUnread: labels.includes("UNREAD"),
  };
}

/** Persiste espejo local de labels (INBOX / UNREAD / TRASH). */
export async function applyThreadLabelFlags(params: {
  tenantId: string;
  emailAccountId: string;
  providerThreadId: string;
  labelIds: string[] | null | undefined;
}): Promise<void> {
  const flags = flagsFromLabelIds(params.labelIds);
  await prisma.crmEmailThread.updateMany({
    where: {
      tenantId: params.tenantId,
      emailAccountId: params.emailAccountId,
      providerThreadId: params.providerThreadId,
    },
    data: flags,
  });
}
