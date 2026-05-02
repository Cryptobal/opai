import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal/cliente/vra-reports?installationId=...
 * Devuelve los informes VRA visibles en portal cliente.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "client_portal") {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const tenantId = session.user.tenantId;
    const { searchParams } = new URL(request.url);
    const installationId = searchParams.get("installationId");

    const where: Record<string, unknown> = {
      tenantId,
      portalVisible: true,
      status: { in: ["ready", "approved", "sent"] },
    };
    if (installationId) where.installationId = installationId;

    const reports = await prisma.vraReport.findMany({
      where,
      orderBy: { generatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        riskLevel: true,
        version: true,
        generatedAt: true,
        pdfUrl: true,
        publicToken: true,
        installation: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, reports });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
