import { NextRequest, NextResponse } from "next/server";
import { requireTenantModule } from "@/lib/require-module";
import { ensureCamarasEdit, ensureCamarasView, canConfigureCamaras } from "@/lib/camaras/access";
import { createCamaraSchema } from "@/lib/camaras/schemas";
import { serializeCamara } from "@/lib/camaras/serialize";
import { listCamaras } from "@/lib/camaras/repo";
import { assertInstallation, createCamara } from "@/lib/camaras/mutate";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasView(modCheck.ctx);
    if (forbidden) return forbidden;

    const sp = request.nextUrl.searchParams;
    const installationId = sp.get("installationId") || undefined;
    const accountId = sp.get("accountId") || undefined;
    const includeInactive = sp.get("includeInactive") === "true";

    const cameras = await listCamaras(modCheck.ctx.tenantId, {
      installationId,
      accountId,
      includeInactive,
    });

    const canConfigure = await canConfigureCamaras(modCheck.ctx);
    return NextResponse.json({
      success: true,
      canConfigure,
      data: cameras.map((c) => serializeCamara(c)),
    });
  } catch (e) {
    console.error("[ops/camaras GET]", e);
    return NextResponse.json({ success: false, error: "Error al listar cámaras" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("ops_camaras");
    if (!modCheck.authorized) return modCheck.response;
    const forbidden = await ensureCamarasEdit(modCheck.ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const parsed = createCamaraSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const inst = await assertInstallation(modCheck.ctx.tenantId, parsed.data.installationId);
    if (!inst) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    const result = await createCamara(modCheck.ctx, parsed.data);
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (e) {
    console.error("[ops/camaras POST]", e);
    return NextResponse.json({ success: false, error: "Error al crear cámara" }, { status: 500 });
  }
}
