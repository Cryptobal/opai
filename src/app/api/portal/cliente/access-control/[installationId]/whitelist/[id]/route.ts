import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureInstallationAccess, requirePortalClienteAuth } from "@/lib/portal-cliente";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string; id: string }> }
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { installationId, id } = await params;

    if (!(await ensureInstallationAccess(session, installationId))) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const body = await request.json();

    // CRÍTICO: verificar que la entrada pertenezca a la misma instalación + tenant
    // y sea whitelist (los clientes solo gestionan whitelist, nunca blacklist).
    const existing = await prisma.accessControlList.findFirst({
      where: {
        id,
        installationId,
        tenantId: session.tenantId,
        listType: "whitelist",
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Entrada no encontrada" },
        { status: 404 }
      );
    }

    const entry = await prisma.accessControlList.update({
      where: { id },
      data: {
        fullName: body.fullName,
        company: body.company,
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        allowedDays: body.allowedDays,
        allowedTimeFrom: body.allowedTimeFrom,
        allowedTimeTo: body.allowedTimeTo,
        isActive: body.isActive,
      },
    });

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error("[ClientPortal] Error updating whitelist entry:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar entrada" },
      { status: 500 }
    );
  }
}
