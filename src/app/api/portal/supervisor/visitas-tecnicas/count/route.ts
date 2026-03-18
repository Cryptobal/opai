import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSupervisorSession } from "@/lib/portal-supervisor";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const result = await validateSupervisorSession(session);
    if (!result.success || !result.data) {
      return NextResponse.json({ success: false, error: result.error }, { status: 403 });
    }

    const { adminId, tenantId } = result.data;

    const count = await prisma.opsVisitaTecnica.count({
      where: {
        tenantId,
        userId: adminId,
        status: "programada",
      },
    });

    return NextResponse.json({ success: true, data: { count } });
  } catch (error) {
    console.error("[visitas-tecnicas/count] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener el conteo" },
      { status: 500 }
    );
  }
}
