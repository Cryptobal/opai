import { NextRequest, NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { ensureCamarasView } from "@/lib/camaras/access";
import { layoutSchema } from "@/lib/camaras/schemas";
import { createCamaraLayout, listCamaraLayouts } from "@/lib/camaras/layouts";

export async function GET() {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasView(modCheck.ctx);
    if (forbidden) return forbidden;

    const data = await listCamaraLayouts(modCheck.ctx.tenantId, modCheck.ctx.userId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[ops/camaras layouts GET]", e);
    return NextResponse.json({ success: false, error: "Error al listar páginas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasView(modCheck.ctx);
    if (forbidden) return forbidden;

    const parsed = layoutSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const row = await createCamaraLayout(modCheck.ctx.tenantId, modCheck.ctx.userId, parsed.data);
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (e) {
    console.error("[ops/camaras layouts POST]", e);
    return NextResponse.json({ success: false, error: "Error al guardar la página" }, { status: 500 });
  }
}
