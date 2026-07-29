import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { hasGmailModify } from "@/lib/gmail";
import {
  runCorreoThreadAction,
  type CorreoAction,
} from "@/modules/crm/email/gmail-thread-actions";
import { broadcastGmailMailboxChanged } from "@/modules/crm/email/gmail-realtime";
import { auditEmailAction } from "@/lib/audit-email";
import { requireThreadMailbox } from "@/modules/crm/email/mailbox-scope";

const ACTIONS = new Set<CorreoAction>([
  "archive",
  "unarchive",
  "trash",
  "untrash",
  "markRead",
  "markUnread",
  "snooze",
  "unsnooze",
  "star",
  "unstar",
  "spam",
  "unspam",
]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { threadId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; snoozeUntil?: string };
  if (!body.action || !ACTIONS.has(body.action as CorreoAction)) {
    return NextResponse.json({ error: "action inválida" }, { status: 400 });
  }

  let snoozeUntil: Date | undefined;
  if (body.action === "snooze") {
    const d = body.snoozeUntil ? new Date(body.snoozeUntil) : null;
    if (!d || Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      return NextResponse.json({ error: "snoozeUntil inválido" }, { status: 400 });
    }
    snoozeUntil = d;
  }

  const owned = await requireThreadMailbox({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    threadId,
  });
  if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status });
  const { account } = owned;

  if (!hasGmailModify(account.grantedScopes)) {
    return NextResponse.json(
      { error: "Reconectá Gmail para habilitar archivar y eliminar", needsReconnect: true },
      { status: 403 },
    );
  }

  const result = await runCorreoThreadAction({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    threadId,
    action: body.action as CorreoAction,
    snoozeUntil,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { invalidateCorreoFolderCounts } = await import(
    "@/modules/crm/email/correos-folder-counts"
  );
  invalidateCorreoFolderCounts(session.user.tenantId, account.id);
  await broadcastGmailMailboxChanged({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    reason: `action:${body.action}`,
  });
  void auditEmailAction({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    userEmail: session.user.email,
    action: body.action as CorreoAction,
    entityType: "email_thread",
    entityId: threadId,
    meta: snoozeUntil ? { snoozeUntil: snoozeUntil.toISOString() } : undefined,
  });

  return NextResponse.json({ ok: true, action: body.action });
}
