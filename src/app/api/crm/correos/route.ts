/** GET /api/crm/correos — bandeja unificada o por casilla del usuario. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { listCorreoThreads, type CorreoListFilter } from "@/modules/crm/email/correos-list";
import { countCorreoFolders } from "@/modules/crm/email/correos-folder-counts";
import { getGmailSyncParkedInfo } from "@/modules/crm/email/gmail-sync-queue";
import { gmailMailboxChannel } from "@/modules/crm/email/gmail-realtime";
import { resolveMailboxScope } from "@/modules/crm/email/mailbox-scope";
import { resolveMultiAccount } from "@/modules/shared/multi-account";
import { hasGmailModify } from "@/lib/gmail";

/** Búsqueda híbrida + hydrate; sin techo el gateway corta con HTML → falso offline. */
export const maxDuration = 30;

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

async function readSavedCorreoScope(userId: string): Promise<string | null> {
  const pref = await prisma.adminPreference.findUnique({
    where: { adminId: userId },
    select: { data: true },
  });
  const data = pref?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const scope = (data as Record<string, unknown>).correoScope;
  return typeof scope === "string" && scope.trim() ? scope.trim() : null;
}

async function writeCorreoScope(userId: string, correoScope: string) {
  const existing = await prisma.adminPreference.findUnique({
    where: { adminId: userId },
    select: { data: true },
  });
  const prev =
    existing?.data && typeof existing.data === "object" && !Array.isArray(existing.data)
      ? (existing.data as Record<string, unknown>)
      : {};
  await prisma.adminPreference.upsert({
    where: { adminId: userId },
    create: { adminId: userId, data: { correoScope } },
    update: { data: { ...prev, correoScope } },
  });
}

export async function GET(req: NextRequest) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  const userId = session.user.id;
  const paramAccountId = req.nextUrl.searchParams.get("accountId");
  const fromQuery = Boolean(paramAccountId);
  let requestedAccountId = paramAccountId ?? (await readSavedCorreoScope(userId));

  let resolved = await resolveMailboxScope({
    tenantId,
    userId,
    requestedAccountId,
  });

  // Preferencia guardada apunta a casilla borrada → degradar a unificada.
  if (
    !resolved.ok &&
    resolved.status === 403 &&
    !fromQuery &&
    requestedAccountId &&
    requestedAccountId !== "all"
  ) {
    await writeCorreoScope(userId, "all");
    requestedAccountId = "all";
    resolved = await resolveMailboxScope({
      tenantId,
      userId,
      requestedAccountId: "all",
    });
  }

  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { scope } = resolved;

  const multi = await resolveMultiAccount({
    tenantId,
    userId,
    scope: "correo",
  });
  const multiAccount = { enabled: multi.enabled, canConnect: multi.canConnect };

  if (scope.accountIds.length === 0) {
    return NextResponse.json({
      connected: false,
      accounts: [],
      activeAccountId: null,
      defaultAccountId: null,
      items: [],
      nextCursor: null,
      counts: null,
      multiAccount,
    });
  }

  const folder = parseFolder(req.nextUrl.searchParams.get("folder"));
  // C18 (PR-13): los 9 counts NO se calculan en cada request — solo cuando el
  // cliente los pide (carga inicial, cambio de carpeta, invalidación realtime).
  const wantCounts = req.nextUrl.searchParams.get("counts") === "1";
  // Ausente o "0" → solo léxico; "1" habilita la rama semántica.
  const exactOnly = req.nextUrl.searchParams.get("semantic") !== "1";
  void req.nextUrl.searchParams.get("mode");

  const activeAccount =
    scope.activeAccountId != null
      ? scope.accounts.find((a) => a.id === scope.activeAccountId) ?? null
      : null;
  const mailboxEmail = activeAccount?.email ?? null;

  const parkedInfos = await Promise.all(
    scope.accountIds.map((id) => getGmailSyncParkedInfo(id)),
  );
  const syncParkedInfo =
    parkedInfos.find((p) => p.parked) ?? parkedInfos[0] ?? { parked: false, reason: null };

  const syncAccountId =
    scope.activeAccountId ?? scope.defaultAccountId ?? scope.accountIds[0];
  const syncAccount = await prisma.crmEmailAccount.findFirst({
    where: { id: syncAccountId, tenantId },
    select: { syncState: true },
  });

  const [
    { items, nextCursor, semanticAvailable, searchMeta, searchScope },
    counts,
    coverage,
  ] = await Promise.all([
    listCorreoThreads({
      tenantId,
      emailAccountIds: scope.accountIds,
      mailboxEmail,
      cursor: req.nextUrl.searchParams.get("cursor"),
      folder,
      q: req.nextUrl.searchParams.get("q"),
      withTasks: req.nextUrl.searchParams.get("withTasks") === "1",
      exactOnly,
    }),
    wantCounts
      ? countCorreoFolders({
          tenantId,
          emailAccountIds: scope.accountIds,
        })
      : null,
    wantCounts
      ? import("@/modules/crm/email/email-index-coverage").then((m) =>
          m.getEmailIndexCoverage({
            tenantId,
            emailAccountIds: scope.accountIds,
          }),
        )
      : null,
  ]);

  const syncRaw =
    syncAccount?.syncState &&
    typeof syncAccount.syncState === "object" &&
    !Array.isArray(syncAccount.syncState)
      ? (syncAccount.syncState as { backfillDone?: boolean; lastSyncAt?: string })
      : {};

  const scopedAccounts = scope.accounts.filter((a) => scope.accountIds.includes(a.id));
  const canModify = scopedAccounts.every((a) => hasGmailModify(a.grantedScopes));
  const limitingAccounts = scopedAccounts
    .filter((a) => !hasGmailModify(a.grantedScopes))
    .map((a) => a.email);

  return NextResponse.json({
    connected: true,
    email: mailboxEmail,
    accounts: scope.accounts.map((a) => ({
      id: a.id,
      email: a.email,
      color: a.color,
      displayLabel: a.displayLabel,
      isDefault: a.isDefault,
      sortIndex: a.sortIndex,
      status: a.status,
      canModify: hasGmailModify(a.grantedScopes),
    })),
    activeAccountId: scope.activeAccountId,
    defaultAccountId: scope.defaultAccountId,
    items,
    nextCursor,
    counts,
    coverage,
    semanticAvailable: semanticAvailable ?? true,
    searchMeta: searchMeta ?? null,
    searchScope: searchScope ?? null,
    realtimeChannel: gmailMailboxChannel(tenantId, userId),
    canModify,
    limitingAccounts: limitingAccounts.length ? limitingAccounts : null,
    backfillDone: Boolean(syncRaw.backfillDone),
    totalThreads: counts ? counts.all + counts.trash : null,
    lastSyncAt: syncRaw.lastSyncAt ?? null,
    syncParked: syncParkedInfo.parked,
    syncParkedReason: syncParkedInfo.reason,
    multiAccount,
  });
}
