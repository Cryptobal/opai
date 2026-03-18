import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const supervisors = await prisma.admin.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "active",
        supervisorAssignments: { some: { isActive: true } },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });

    // Si no hay supervisores asignados, devolver todos los admins activos
    if (supervisors.length === 0) {
      const all = await prisma.admin.findMany({
        where: { tenantId: ctx.tenantId, status: "active" },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ success: true, data: all, fallback: true });
    }

    return NextResponse.json({ success: true, data: supervisors });
  } catch (error) {
    console.error("[ops/supervisors] Error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la lista de supervisores" },
      { status: 500 }
    );
  }
}
