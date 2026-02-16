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

    const admins = await prisma.admin.findMany({
      where: { tenantId: ctx.tenantId, status: "active" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: admins });
  } catch (error) {
    console.error("[OPS] Error listing admins:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la lista de usuarios" },
      { status: 500 },
    );
  }
}
