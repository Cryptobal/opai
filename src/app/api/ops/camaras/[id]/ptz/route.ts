import { NextRequest, NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { ensureCamarasView } from "@/lib/camaras/access";
import { ptzSchema } from "@/lib/camaras/schemas";
import { runCamaraPtz } from "@/lib/camaras/live";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasView(modCheck.ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();
    const parsed = ptzSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const result = await runCamaraPtz(modCheck.ctx.tenantId, id, parsed.data);
    if ("notFound" in result) {
      return NextResponse.json({ success: false, error: "Cámara no encontrada" }, { status: 404 });
    }
    if ("unavailable" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[ops/camaras ptz]", e);
    return NextResponse.json({ success: false, error: "Error PTZ" }, { status: 500 });
  }
}
