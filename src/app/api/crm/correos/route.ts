/** GET /api/crm/correos — bandeja de correos de la casilla del usuario. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import { listCorreoThreads, type CorreoListFilter } from "@/modules/crm/email/correos-list";
import { countCorreoFolders } from "@/modules/crm/email/correos-folder-counts";

function parseFolder(raw: string | null): CorreoListFilter {
  if (raw === "archived" || raw === "trash") return raw;
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
    select: { id: true, email: true, grantedScopes: true },
  });
  if (!account) {
    return NextResponse.json({ connected: false, items: [], nextCursor: null, counts: null });
  }

  const folder = parseFolder(req.nextUrl.searchParams.get("folder"));
  const [{ items, nextCursor }, counts] = await Promise.all([
    listCorreoThreads({
      tenantId: session.user.tenantId,
      emailAccountId: account.id,
      mailboxEmail: account.email,
      cursor: req.nextUrl.searchParams.get("cursor"),
      folder,
    }),
    countCorreoFolders({
      tenantId: session.user.tenantId,
      emailAccountId: account.id,
    }),
  ]);

  const { hasGmailModify } = await import("@/lib/gmail");
  return NextResponse.json({
    connected: true,
    email: account.email,
    items,
    nextCursor,
    counts,
    canModify: hasGmailModify(account.grantedScopes),
  });
}
