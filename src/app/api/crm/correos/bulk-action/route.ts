/**
 * POST /api/crm/correos/bulk-action (C12, PR-14): acción masiva sobre hilos.
 * Procesa server-side en serie (el GmailAdapter regula la cuota por casilla);
 * responde cuántos se aplicaron y cuáles fallaron. Máximo 100 por request.
 */
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
import { auditEmailAction } from "@/lib/audit-email";

export const maxDuration = 60;

const BULK_ACTIONS = new Set<CorreoAction>([
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
const MAX_BULK = 100;

export async function POST(req: NextRequest) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    threadIds?: unknown;
    action?: string;
    snoozeUntil?: string;
  };
  const threadIds = Array.isArray(body.threadIds)
    ? body.threadIds.filter((id): id is string => typeof id === "string")
    : [];
  if (threadIds.length === 0 || threadIds.length > MAX_BULK) {
    return NextResponse.json(
      { error: `threadIds requerido (máx ${MAX_BULK})` },
      { status: 400 },
    );
  }
  if (!body.action || !BULK_ACTIONS.has(body.action as CorreoAction)) {
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

  const account = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
    select: { id: true, grantedScopes: true },
  });
  if (!hasGmailModify(account?.grantedScopes)) {
    return NextResponse.json(
      { error: "Reconectá Gmail para habilitar acciones", needsReconnect: true },
      { status: 403 },
    );
  }

  let applied = 0;
  const failed: string[] = [];
  for (const threadId of threadIds) {
    const result = await runCorreoThreadAction({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      threadId,
      action: body.action as CorreoAction,
      snoozeUntil,
    });
    if (result.ok) applied += 1;
    else failed.push(threadId);
  }

  if (account) {
    await broadcastGmailMailboxChanged({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      reason: `bulk:${body.action}`,
    });
  }
  void auditEmailAction({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    userEmail: session.user.email,
    action: body.action as CorreoAction,
    entityType: "email_thread",
    entityId: threadIds[0],
    meta: {
      bulk: true,
      count: threadIds.length,
      applied,
      failed: failed.length,
      ...(snoozeUntil ? { snoozeUntil: snoozeUntil.toISOString() } : {}),
    },
  });

  return NextResponse.json({ ok: failed.length === 0, applied, failed });
}
