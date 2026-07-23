/** GET /api/crm/correos/deals-for-account?accountId= — negocios abiertos de una cuenta. */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";

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

  const items = await prisma.crmDeal.findMany({
    where: { tenantId, accountId, status: "open" },
    select: { id: true, title: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ items });
}
