import { NextRequest, NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { ensureCamarasView } from "@/lib/camaras/access";
import { testCamaraConnection } from "@/lib/camaras/live";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasView(modCheck.ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const result = await testCamaraConnection(modCheck.ctx.tenantId, id);
    if ("notFound" in result) {
      return NextResponse.json({ success: false, error: "Cámara no encontrada" }, { status: 404 });
    }
    if ("error" in result && !("dataUrl" in result)) {
      return NextResponse.json(
        { success: false, error: result.error, camera: "camera" in result ? result.camera : undefined },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[ops/camaras test]", e);
    return NextResponse.json({ success: false, error: "Error al probar la cámara" }, { status: 500 });
  }
}
