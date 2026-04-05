import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

/**
 * GET /api/portal/guardia/ofertas/mis-postulaciones?guardiaId=xxx
 * Lists the guard's job applications with status.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const guardiaId = searchParams.get("guardiaId");
  const guardAuth = await requirePortalGuardiaAuth(guardiaId);
  if (!guardAuth) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  const applications = await prisma.atsApplication.findMany({
    where: { guardiaId: guardAuth.guardiaId },
    select: {
      id: true,
      etapa: true,
      createdAt: true,
      jobPosting: {
        select: {
          titulo: true,
          region: true,
          turno: true,
          tenant: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Map to expected frontend shape
  const data = applications.map((a: (typeof applications)[number]) => ({
    id: a.id,
    status: a.etapa,
    createdAt: a.createdAt.toISOString(),
    jobPosting: a.jobPosting,
  }));

  return NextResponse.json({ success: true, data });
}
