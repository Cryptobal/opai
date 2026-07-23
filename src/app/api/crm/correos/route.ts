/** GET /api/crm/correos — bandeja de correos de la casilla del usuario. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import { listCorreoThreads, type CorreoListFilter } from "@/modules/crm/email/correos-list";
import { countCorreoFolders } from "@/modules/crm/email/correos-folder-counts";
import { isGmailSyncParked } from "@/modules/crm/email/gmail-sync-queue";
import { gmailMailboxChannel } from "@/modules/crm/email/gmail-realtime";

function parseFolder(raw: string | null): CorreoListFilter {
  if (
    raw === "archived" ||
    raw === "all" ||
    raw === "trash" ||
    raw === "snoozed" ||
    raw === "sent" ||
    raw === "drafts" ||
    raw === "spam" ||
    raw === "starred"
  ) {
    return raw;
  }
  return "inbox";
}

export async function GET(req: NextRequest) {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const account = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
    select: { id: true, email: true, grantedScopes: true, syncState: true },
  });
  if (!account) {
    return NextResponse.json({ connected: false, items: [], nextCursor: null, counts: null });
  }

  const folder = parseFolder(req.nextUrl.searchParams.get("folder"));
  const [{ items, nextCursor }, counts, syncParked] = await Promise.all([
    listCorreoThreads({
      tenantId: session.user.tenantId,
      emailAccountId: account.id,
      mailboxEmail: account.email,
      cursor: req.nextUrl.searchParams.get("cursor"),
      folder,
      // C15: búsqueda server-side sobre toda la casilla sincronizada.
      q: req.nextUrl.searchParams.get("q"),
    }),
    countCorreoFolders({
      tenantId: session.user.tenantId,
      emailAccountId: account.id,
    }),
    isGmailSyncParked(account.id),
  ]);

  const syncRaw =
    account.syncState && typeof account.syncState === "object" && !Array.isArray(account.syncState)
      ? (account.syncState as { backfillDone?: boolean; lastSyncAt?: string })
      : {};
  const { hasGmailModify } = await import("@/lib/gmail");
  return NextResponse.json({
    connected: true,
    email: account.email,
    items,
    nextCursor,
    counts,
    realtimeChannel: gmailMailboxChannel(
      session.user.tenantId,
      session.user.id,
    ),
    canModify: hasGmailModify(account.grantedScopes),
    backfillDone: Boolean(syncRaw.backfillDone),
    totalThreads: counts.all + counts.trash,
    lastSyncAt: syncRaw.lastSyncAt ?? null,
    syncParked,
  });
}
