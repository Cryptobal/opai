import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import { ensureCamarasView } from "@/lib/camaras/access";
import { layoutSchema } from "@/lib/camaras/schemas";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasView(modCheck.ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const parsed = layoutSchema.partial().safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const existing = await prisma.opsCamaraLayout.findFirst({
      where: { id, tenantId: modCheck.ctx.tenantId, userId: modCheck.ctx.userId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Página no encontrada" }, { status: 404 });
    }

    let cameraIds = parsed.data.cameraIds;
    if (cameraIds) {
      const rows = await prisma.opsCamara.findMany({
        where: { tenantId: modCheck.ctx.tenantId, isActive: true, id: { in: cameraIds } },
        select: { id: true },
      });
      const allowed = new Set(rows.map((r) => r.id));
      cameraIds = cameraIds.filter((cid) => allowed.has(cid));
    }

    const row = await prisma.opsCamaraLayout.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.gridSize !== undefined ? { gridSize: parsed.data.gridSize } : {}),
        ...(cameraIds !== undefined ? { cameraIds } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
      },
    });
    return NextResponse.json({ success: true, data: row });
  } catch (e) {
    console.error("[ops/camaras layouts PATCH]", e);
    return NextResponse.json({ success: false, error: "Error al actualizar la página" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasView(modCheck.ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const existing = await prisma.opsCamaraLayout.findFirst({
      where: { id, tenantId: modCheck.ctx.tenantId, userId: modCheck.ctx.userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Página no encontrada" }, { status: 404 });
    }
    await prisma.opsCamaraLayout.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[ops/camaras layouts DELETE]", e);
    return NextResponse.json({ success: false, error: "Error al eliminar la página" }, { status: 500 });
  }
}
