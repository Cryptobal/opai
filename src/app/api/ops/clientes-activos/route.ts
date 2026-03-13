import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const clients = await prisma.crmAccount.findMany({
      where: {
        tenantId: ctx.tenantId,
        type: "client",
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        rut: true,
        installations: {
          where: { status: "active" },
          select: {
            id: true,
            name: true,
            teMontoClp: true,
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: clients });
  } catch (error) {
    console.error("[OPS] Error listing active clients:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los clientes activos" },
      { status: 500 }
    );
  }
}
