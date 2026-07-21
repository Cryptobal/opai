import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantModule } from "@/lib/require-module";
import { hasGmailModify } from "@/lib/gmail";
import { prisma } from "@/lib/prisma";
import {
  runCorreoThreadAction,
  type CorreoAction,
} from "@/modules/crm/email/gmail-thread-actions";

const ACTIONS = new Set<CorreoAction>([
  "archive",
  "unarchive",
  "trash",
  "markRead",
  "markUnread",
  "snooze",
  "unsnooze",
]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ threadId: string }> },
) {
  const mod = await requireTenantModule("crm");
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
  if (account) {
    const { invalidateCorreoFolderCounts } = await import(
      "@/modules/crm/email/correos-folder-counts"
    );
    invalidateCorreoFolderCounts(session.user.tenantId, account.id);
  }
  return NextResponse.json({ ok: true, action: body.action });
}
