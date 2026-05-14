import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";
import { requireAccessControlAuth } from "@/lib/access-control/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const preregistrations = await safeAccessControlQuery(
      () => prisma.accessControlPreregistration.findMany({
        where: {
          installationId,
          expectedDate: { gte: today, lt: tomorrow },
        },
        orderBy: { expectedTimeFrom: "asc" },
      }),
      [],
    );

    return NextResponse.json({ success: true, data: preregistrations });
  } catch (error) {
    console.error("[AccessControl] Error fetching today's preregistrations:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener esperados de hoy" },
      { status: 500 }
    );
  }
}
