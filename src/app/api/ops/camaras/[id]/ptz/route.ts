import { NextRequest, NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { ensureCamarasView } from "@/lib/camaras/access";
import { ptzSchema } from "@/lib/camaras/schemas";
import { getCamara } from "@/lib/camaras/mutate";
import { decryptCameraSecret } from "@/lib/camaras/credentials";
import { ptzMove, ptzStop } from "@/lib/camaras/onvif-ptz";

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
      return NextResponse.json({ success: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const camara = await getCamara(modCheck.ctx.tenantId, id, true);
    if (!camara) {
      return NextResponse.json({ success: false, error: "Cámara no encontrada" }, { status: 404 });
    }
    if (!camara.ptzCapable) {
      return NextResponse.json({ success: false, error: "PTZ no disponible" }, { status: 400 });
    }

    const password = decryptCameraSecret(camara.passwordEnc);
    const target = { host: camara.host, onvifPort: camara.onvifPort, username: camara.username };
    try {
      if (parsed.data.action === "stop") {
        await ptzStop(target, password);
      } else {
        await ptzMove(target, password, {
          pan: parsed.data.pan ?? 0,
          tilt: parsed.data.tilt ?? 0,
          zoom: parsed.data.zoom ?? 0,
        });
      }
      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json({ success: false, error: "PTZ no disponible" }, { status: 502 });
    }
  } catch (e) {
    console.error("[ops/camaras ptz]", e);
    return NextResponse.json({ success: false, error: "Error PTZ" }, { status: 500 });
  }
}
