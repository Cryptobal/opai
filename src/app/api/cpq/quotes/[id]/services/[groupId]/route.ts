/**
 * API Route: /api/cpq/quotes/[id]/services/[groupId]
 * PATCH  - Actualizar nombre / icon / color / order / notes / coveragePattern
 * DELETE - Eliminar grupo. Por defecto SET NULL en positions.
 *          Pasar ?cascade=true para eliminar también los shifts hijos.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit, requireCpqDelete } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { refreshQuoteTotals } from "@/modules/cpq/costing/compute-quote-costs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  try {
    const mod = await requireTenantModule("cpq");
    if (!mod.authorized) return mod.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id, groupId } = await params;
    const body = await req.json();
    const allowed = [
      "name",
      "coveragePattern",
      "iconName",
      "colorHex",
      "notes",
      "displayOrder",
    ];
    const data: Record<string, any> = {};
    for (const k of allowed) if (body[k] !== undefined) data[k] = body[k];

    if (typeof data.name === "string") {
      data.name = data.name.trim();
      if (!data.name) {
        return NextResponse.json({ success: false, error: "Nombre vacío" }, { status: 400 });
      }
    }

    const group = await prisma.cpqServiceGroup.findFirst({
      where: { id: groupId, quoteId: id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!group) {
      return NextResponse.json({ success: false, error: "Grupo no encontrado" }, { status: 404 });
    }

    const updated = await prisma.cpqServiceGroup.update({ where: { id: groupId }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating CPQ service group:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update service group" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  try {
    const mod = await requireTenantModule("cpq");
    if (!mod.authorized) return mod.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqDelete(ctx);
    if (forbidden) return forbidden;

    const { id, groupId } = await params;
    const url = new URL(req.url);
    const cascade = url.searchParams.get("cascade") === "true";

    const group = await prisma.cpqServiceGroup.findFirst({
      where: { id: groupId, quoteId: id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!group) {
      return NextResponse.json({ success: false, error: "Grupo no encontrado" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      if (cascade) {
        await tx.cpqPosition.deleteMany({ where: { serviceGroupId: groupId, quoteId: id } });
      }
      await tx.cpqServiceGroup.delete({ where: { id: groupId } });
    });

    await refreshQuoteTotals(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting CPQ service group:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete service group" },
      { status: 500 }
    );
  }
}
