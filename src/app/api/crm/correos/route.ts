/** GET /api/crm/correos — bandeja de correos de la casilla del usuario. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import { listCorreoThreads } from "@/modules/crm/email/correos-list";

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
    select: { id: true, email: true },
  });
  if (!account) {
    return NextResponse.json({ connected: false, items: [], nextCursor: null });
  }

  const { items, nextCursor } = await listCorreoThreads({
    tenantId: session.user.tenantId,
    emailAccountId: account.id,
    cursor: req.nextUrl.searchParams.get("cursor"),
  });

  return NextResponse.json({ connected: true, email: account.email, items, nextCursor });
}
