import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/access";
import { readSyncState } from "@/modules/crm/email/gmail-sync-state";
import { hasGmailModify } from "@/lib/gmail";

/**
 * GET /api/integrations/gmail/status
 * Estado de la casilla Gmail del usuario + (owner/admin) equipo con quién
 * tiene Gmail conectado — mismo patrón que Calendar.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;
  const elevated = isAdminRole(session.user.role ?? "");

  const mine = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
    select: {
      id: true,
      email: true,
      syncState: true,
      grantedScopes: true,
    },
  });

  let sync: {
    backfillDone: boolean;
    totalThreads: number;
    lastSyncAt: string | null;
    canModify: boolean;
  } | null = null;

  if (mine) {
    const syncState = readSyncState(mine.syncState);
    const totalThreads = await prisma.crmEmailThread.count({
      where: { tenantId, emailAccountId: mine.id },
    });
    sync = {
      backfillDone: Boolean(syncState?.backfillDone),
      totalThreads,
      lastSyncAt: syncState?.lastSyncAt ?? null,
      canModify: hasGmailModify(mine.grantedScopes),
    };
  }

  let team: Array<{
    userId: string;
    name: string;
    email: string;
    connected: boolean;
    googleEmail: string | null;
  }> = [];

  if (elevated) {
    const [users, accounts] = await Promise.all([
      prisma.admin.findMany({
        where: { tenantId, status: "active" },
        select: { id: true, name: true, email: true },
        take: 100,
        orderBy: { name: "asc" },
      }),
      prisma.crmEmailAccount.findMany({
        where: { tenantId, provider: "gmail", status: "active" },
        select: { userId: true, email: true },
      }),
    ]);
    const byUser = new Map<string, string>();
    for (const a of accounts) {
      if (!byUser.has(a.userId)) byUser.set(a.userId, a.email);
    }
    team = users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      connected: byUser.has(u.id),
      googleEmail: byUser.get(u.id) ?? null,
    }));
  }

  return NextResponse.json({
    connected: Boolean(mine),
    googleEmail: mine?.email ?? null,
    sync,
    team,
  });
}
