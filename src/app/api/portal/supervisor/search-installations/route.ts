import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/portal/supervisor/search-installations?q=term
 * Busca instalaciones prospecto (isActive=false) del tenant para la visita técnica.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  }

  const admin = await prisma.admin.findUnique({
    where: { id: session.user.id },
    select: { tenantId: true, status: true },
  });

  if (!admin || admin.status !== "active") {
    return NextResponse.json({ success: false, error: "Sin acceso" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const installations = await prisma.crmInstallation.findMany({
    where: {
      tenantId: admin.tenantId,
      status: "prospect",
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { address: { contains: q, mode: "insensitive" } },
              { account: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      address: true,
      account: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
    take: 50,
  });

  const data = installations.map((i) => ({
    id: i.id,
    name: i.name,
    address: i.address,
    accountId: i.account?.id ?? "",
    accountName: i.account?.name ?? "",
    status: "prospect",
    pairingCode: null,
    lat: null,
    lng: null,
    geoRadiusM: 100,
  }));

  return NextResponse.json({ success: true, data });
}
