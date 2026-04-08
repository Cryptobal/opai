import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";
import { logAudit } from "@/lib/audit";
import { decryptPersonaFields } from "@/lib/persona-encryption";

/**
 * GET /api/portal/guardia/mis-datos/exportar?guardiaId=xxx
 * Derecho de PORTABILIDAD (Art. 9 Ley 21.719). Exporta JSON descargable.
 */
export async function GET(request: NextRequest) {
  try {
    const guardiaId = new URL(request.url).searchParams.get("guardiaId");
    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardAuth.guardiaId, tenantId: guardAuth.tenantId },
      include: {
        persona: true,
        currentInstallation: { select: { id: true, name: true } },
        asignaciones: {
          select: { installationId: true, startDate: true, endDate: true },
          take: 100,
          orderBy: { startDate: "desc" },
        },
      },
    });

    if (!guardia) {
      return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    }

    await logAudit({
      userId: guardAuth.guardiaId,
      action: "EXPORT_DATA",
      entity: "OpsPersona",
      entityId: guardia.persona.id,
      details: { type: "ARCO_PORTABILITY", format: "json" },
      tenantId: guardAuth.tenantId,
      request,
    });

    const exportData = {
      exportDate: new Date().toISOString(),
      platform: "Opai",
      dataSubject: {
        persona: {
          ...decryptPersonaFields(guardia.persona),
          id: undefined,
          tenantId: undefined,
        },
        guardia: {
          code: guardia.code,
          status: guardia.status,
          lifecycleStatus: guardia.lifecycleStatus,
          hiredAt: guardia.hiredAt,
          contractType: guardia.contractType,
          faceIdRegistered: guardia.faceIdRegistered,
          faceIdConsentAt: guardia.faceIdConsentAt,
          currentInstallation: guardia.currentInstallation?.name ?? null,
        },
        asignacionesRecientes: guardia.asignaciones.map((a) => ({
          installationId: a.installationId,
          inicio: a.startDate,
          fin: a.endDate,
        })),
      },
    };

    const date = new Date().toISOString().split("T")[0];
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="mis-datos-opai-${date}.json"`,
      },
    });
  } catch (error) {
    console.error("[Portal Guardia] Export error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
