import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { calcDocStatus } from "@/lib/docs-operacionales";

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
    if (body.diasAlerta !== undefined) {
      const n = Number(body.diasAlerta);
      if (!Number.isFinite(n) || n < 0 || n > 365) {
        return NextResponse.json({ success: false, error: "diasAlerta debe estar entre 0 y 365" }, { status: 400 });
      }
      data.diasAlerta = Math.round(n);
    }
    if (body.order !== undefined) data.order = body.order;
    if (body.obligatorioEnVisita !== undefined) data.obligatorioEnVisita = body.obligatorioEnVisita;
    if (body.useAsAiKnowledge !== undefined) data.useAsAiKnowledge = !!body.useAsAiKnowledge;
    if (body.criticoLegal !== undefined) data.criticoLegal = !!body.criticoLegal;
    if (body.milestones !== undefined) {
      // Escalera custom de hitos (Fase 18): null = default [30,14,7,3,1,0].
      if (body.milestones === null) {
        data.milestones = null;
      } else if (Array.isArray(body.milestones)) {
        const nums = (body.milestones as unknown[])
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v >= 0 && v <= 365);
        if (nums.length === 0) {
          return NextResponse.json(
            { success: false, error: "milestones debe ser una lista de días (0-365) o null" },
            { status: 400 }
          );
        }
        data.milestones = [...new Set(nums)].sort((a, b) => b - a);
      } else {
        return NextResponse.json(
          { success: false, error: "milestones debe ser una lista de días (0-365) o null" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.tipoDocOperacional.update({
      where: { id },
      data,
    });

    // Si cambia el esquema de vencimiento, recalcular el status de los documentos asociados
    // para que la UI refleje el cambio sin esperar al cron.
    const vencimientoChanged =
      (body.tieneVencimiento !== undefined && body.tieneVencimiento !== tipo.tieneVencimiento) ||
      (body.diasAlerta !== undefined && Number(body.diasAlerta) !== tipo.diasAlerta);

    if (vencimientoChanged) {
      const docs = await prisma.docOperacional.findMany({
        where: { tenantId: ctx.tenantId, tipoId: id },
        select: { id: true, expiresAt: true, status: true },
      });
      for (const doc of docs) {
        const newStatus = calcDocStatus(doc.expiresAt, updated.tieneVencimiento, updated.diasAlerta);
        if (newStatus !== doc.status) {
          await prisma.docOperacional.update({
            where: { id: doc.id },
            data: { status: newStatus },
          });
        }
      }
    }

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
