import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const tipo = request.nextUrl.searchParams.get("tipo") || undefined;

    const templates = await prisma.opsEmailTemplate.findMany({
      where: {
        tenantId: ctx.tenantId,
        activo: true,
        ...(tipo ? { tipo: tipo as never } : {}),
      },
      select: {
        id: true,
        nombre: true,
        asunto: true,
        tipo: true,
        contenido: true,
        variables: true,
      },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    console.error("[API] comunicaciones/templates GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al cargar plantillas" },
      { status: 500 },
    );
  }
}
