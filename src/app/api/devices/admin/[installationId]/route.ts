import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { installationId } = await params;

    const devices = await prisma.devicePairing.findMany({
      where: { installationId, tenantId: ctx.tenantId },
      orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }],
      include: {
        currentGuard: {
          include: { persona: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    return NextResponse.json({ success: true, data: devices });
  } catch (error) {
    console.error("[devices/admin/list] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar dispositivos" },
      { status: 500 }
    );
  }
}
