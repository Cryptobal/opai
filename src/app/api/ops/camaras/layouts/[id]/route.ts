import { NextRequest, NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { ensureCamarasView } from "@/lib/camaras/access";
import { layoutPatchSchema } from "@/lib/camaras/schemas";
import { deleteCamaraLayout, updateCamaraLayout } from "@/lib/camaras/layouts";

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
    const parsed = layoutPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const row = await updateCamaraLayout(modCheck.ctx.tenantId, modCheck.ctx.userId, id, parsed.data);
    if (!row) {
      return NextResponse.json({ success: false, error: "Página no encontrada" }, { status: 404 });
    }
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
    const ok = await deleteCamaraLayout(modCheck.ctx.tenantId, modCheck.ctx.userId, id);
    if (!ok) {
      return NextResponse.json({ success: false, error: "Página no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[ops/camaras layouts DELETE]", e);
    return NextResponse.json({ success: false, error: "Error al eliminar la página" }, { status: 500 });
  }
}
