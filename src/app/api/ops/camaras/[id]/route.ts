import { NextRequest, NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { canConfigureCamaras, ensureCamarasEdit, ensureCamarasView } from "@/lib/camaras/access";
import { updateCamaraSchema } from "@/lib/camaras/schemas";
import { serializeCamara } from "@/lib/camaras/serialize";
import { deactivateCamara, getCamara, updateCamara } from "@/lib/camaras/mutate";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasView(modCheck.ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const row = await getCamara(modCheck.ctx.tenantId, id);
    if (!row) {
      return NextResponse.json({ success: false, error: "Cámara no encontrada" }, { status: 404 });
    }
    const canConfigure = await canConfigureCamaras(modCheck.ctx);
    return NextResponse.json({
      success: true,
      canConfigure,
      data: serializeCamara(row),
    });
  } catch (e) {
    console.error("[ops/camaras GET id]", e);
    return NextResponse.json({ success: false, error: "Error al obtener la cámara" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasEdit(modCheck.ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateCamaraSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await updateCamara(modCheck.ctx, id, parsed.data);
    if (!result) {
      return NextResponse.json({ success: false, error: "Cámara no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[ops/camaras PATCH]", e);
    return NextResponse.json({ success: false, error: "Error al actualizar cámara" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasEdit(modCheck.ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const row = await deactivateCamara(modCheck.ctx, id);
    if (!row) {
      return NextResponse.json({ success: false, error: "Cámara no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: row });
  } catch (e) {
    console.error("[ops/camaras DELETE]", e);
    return NextResponse.json({ success: false, error: "Error al dar de baja la cámara" }, { status: 500 });
  }
}
