import { NextRequest, NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { ensureCamarasView } from "@/lib/camaras/access";
import { relayTokenSchema } from "@/lib/camaras/schemas";
import { issueRelayAccess } from "@/lib/camaras/live";

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasView(modCheck.ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = relayTokenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const result = await issueRelayAccess(modCheck.ctx, parsed.data.cameraIds);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[ops/camaras relay-token]", e);
    return NextResponse.json({ success: false, error: "Error al emitir token de relay" }, { status: 500 });
  }
}
