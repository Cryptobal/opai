/** GET /api/crm/correos — bandeja de correos de la casilla del usuario. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { listCorreoThreads, type CorreoListFilter } from "@/modules/crm/email/correos-list";
import { countCorreoFolders } from "@/modules/crm/email/correos-folder-counts";
import { getGmailSyncParkedInfo } from "@/modules/crm/email/gmail-sync-queue";
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

const VERTICALES = new Set([
  "operaciones",
  "rrhh",
  "comercial",
  "finanzas",
  "cobranza",
  "contratos",
  "incidentes",
  "otro",
]);

function parseVertical(raw: string | null): string | null {
  return raw && VERTICALES.has(raw) ? raw : null;
}

export async function GET(req: NextRequest) {
  const mod = await requireCorreosAccess();
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
  // C18 (PR-13): los 9 counts NO se calculan en cada request — solo cuando el
  // cliente los pide (carga inicial, cambio de carpeta, invalidación realtime).
  // Load-more y tipeo de búsqueda ya no pagan los counts.
  const wantCounts = req.nextUrl.searchParams.get("counts") === "1";
  const [{ items, nextCursor }, counts, syncParkedInfo] = await Promise.all([
    listCorreoThreads({
      tenantId: session.user.tenantId,
      emailAccountId: account.id,
      mailboxEmail: account.email,
      cursor: req.nextUrl.searchParams.get("cursor"),
      folder,
      // C15: búsqueda server-side sobre toda la casilla sincronizada.
      q: req.nextUrl.searchParams.get("q"),
      // A07: modo "buscar por significado" (retrieval vectorial).
      semantic: req.nextUrl.searchParams.get("mode") === "semantic",
      // A03: filtro por vertical v5.
      vertical: parseVertical(req.nextUrl.searchParams.get("vertical")),
    }),
    wantCounts
      ? countCorreoFolders({
          tenantId: session.user.tenantId,
          emailAccountId: account.id,
        })
      : null,
    getGmailSyncParkedInfo(account.id),
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
    totalThreads: counts ? counts.all + counts.trash : null,
    lastSyncAt: syncRaw.lastSyncAt ?? null,
    syncParked: syncParkedInfo.parked,
    syncParkedReason: syncParkedInfo.reason,
  });
}
