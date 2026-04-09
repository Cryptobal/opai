import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const tipo = await prisma.tipoDocOperacional.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!tipo) {
      return NextResponse.json({ success: false, error: "Tipo no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.nombre !== undefined) data.nombre = body.nombre.trim();
    if (body.normativa !== undefined) data.normativa = body.normativa?.trim() || null;
    if (body.obligatorio !== undefined) data.obligatorio = body.obligatorio;
    if (body.tieneVencimiento !== undefined) data.tieneVencimiento = body.tieneVencimiento;
    if (body.diasAlerta !== undefined) data.diasAlerta = body.diasAlerta;
    if (body.order !== undefined) data.order = body.order;
    if (body.obligatorioEnVisita !== undefined) data.obligatorioEnVisita = body.obligatorioEnVisita;

    const updated = await prisma.tipoDocOperacional.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[TIPOS-DOC-OP] Error updating:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const tipo = await prisma.tipoDocOperacional.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { _count: { select: { documentos: true } } },
    });
    if (!tipo) {
      return NextResponse.json({ success: false, error: "Tipo no encontrado" }, { status: 404 });
    }

    if (tipo._count.documentos > 0) {
      return NextResponse.json(
        { success: false, error: `No se puede eliminar: tiene ${tipo._count.documentos} documento(s) asociado(s). Elimina los documentos primero.` },
        { status: 400 }
      );
    }

    await prisma.tipoDocOperacional.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[TIPOS-DOC-OP] Error deleting:", error);
    return NextResponse.json({ success: false, error: "Error al eliminar" }, { status: 500 });
  }
}
