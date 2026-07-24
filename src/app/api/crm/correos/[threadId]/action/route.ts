import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { hasGmailModify } from "@/lib/gmail";
import { prisma } from "@/lib/prisma";
import {
  runCorreoThreadAction,
  type CorreoAction,
} from "@/modules/crm/email/gmail-thread-actions";
import { broadcastGmailMailboxChanged } from "@/modules/crm/email/gmail-realtime";
import { appendGmailDebugTrace } from "@/modules/crm/email/gmail-debug-trace";
import { auditEmailAction } from "@/lib/audit-email";

const ACTIONS = new Set<CorreoAction>([
  "archive",
  "unarchive",
  "trash",
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

  const threadOwner = await prisma.crmEmailThread.findFirst({
    where: {
      id: threadId,
      tenantId: session.user.tenantId,
    },
    select: { emailAccountId: true },
  });
  if (!threadOwner?.emailAccountId) {
    return NextResponse.json(
      { error: "Hilo no vinculado a Gmail" },
      { status: 400 },
    );
  }

  const account = await prisma.crmEmailAccount.findFirst({
    where: {
      id: threadOwner.emailAccountId,
      tenantId: session.user.tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
    select: { id: true, grantedScopes: true },
  });
  if (!account) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!hasGmailModify(account.grantedScopes)) {
    return NextResponse.json(
      { error: "Reconectá Gmail para habilitar archivar y eliminar", needsReconnect: true },
      { status: 403 },
    );
  }

  // #region agent log
  appendGmailDebugTrace({
    hypothesisId: "E",
    location: "src/app/api/crm/correos/[threadId]/action/route.ts:request",
    message: "Scoped Gmail thread action starting",
    data: {
      action: body.action,
      accountResolved: Boolean(account),
      tenantScoped: Boolean(session.user.tenantId),
      userScoped: Boolean(session.user.id),
      hasModifyScope: hasGmailModify(account?.grantedScopes),
    },
    timestamp: Date.now(),
  });
  // #endregion
  const result = await runCorreoThreadAction({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    threadId,
    action: body.action as CorreoAction,
    snoozeUntil,
  });
  // #region agent log
  appendGmailDebugTrace({
    hypothesisId: "E",
    location: "src/app/api/crm/correos/[threadId]/action/route.ts:result",
    message: "Gmail thread action finished",
    data: {
      action: body.action,
      ok: result.ok,
      status: result.ok ? 200 : result.status,
    },
    timestamp: Date.now(),
  });
  // #endregion
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (account) {
    const { invalidateCorreoFolderCounts } = await import(
      "@/modules/crm/email/correos-folder-counts"
    );
    invalidateCorreoFolderCounts(session.user.tenantId, account.id);
    await broadcastGmailMailboxChanged({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      reason: `action:${body.action}`,
    });
  }
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
