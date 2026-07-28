/** GET /api/crm/correos/deals-for-account?accountId= — negocios de una cuenta (todos los estados). */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";

const STATUS_RANK: Record<string, number> = { open: 0, won: 1, lost: 2 };

export async function GET(req: NextRequest) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const accountId = req.nextUrl.searchParams.get("accountId")?.trim();
  if (!accountId) {
    return NextResponse.json({ error: "accountId requerido" }, { status: 400 });
  }

  const tenantId = session.user.tenantId;
  const account = await prisma.crmAccount.findFirst({
    where: { id: accountId, tenantId },
    select: { id: true },
  });
  if (!account) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  const rows = await prisma.crmDeal.findMany({
    where: { tenantId, accountId },
    select: { id: true, title: true, status: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const items = [...rows].sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 9;
    const rb = STATUS_RANK[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return NextResponse.json({
    items: items.map(({ id, title, status }) => ({ id, title, status })),
  });
}
