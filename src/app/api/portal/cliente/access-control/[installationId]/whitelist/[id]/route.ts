import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureInstallationAccess, requirePortalClienteAuth } from "@/lib/portal-cliente";
import { validateRut, cleanRut, cleanPlate } from "@/lib/access-control/utils";

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
      select: { id: true, rut: true, vehiclePlate: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Entrada no encontrada" },
        { status: 404 }
      );
    }

    const rutUpdate: { rut?: string | null } = {};
    if (body.rut !== undefined) {
      if (body.rut === null || body.rut === "") {
        rutUpdate.rut = null;
      } else if (!validateRut(body.rut)) {
        return NextResponse.json(
          { success: false, error: "RUT inválido" },
          { status: 400 }
        );
      } else {
        rutUpdate.rut = cleanRut(body.rut);
      }
    }

    const plateUpdate: { vehiclePlate?: string | null } = {};
    if (body.vehiclePlate !== undefined) {
      const trimmed = typeof body.vehiclePlate === "string" ? body.vehiclePlate.trim() : "";
      plateUpdate.vehiclePlate = trimmed.length > 0 ? cleanPlate(trimmed) : null;
    }

    const resultingRut = "rut" in rutUpdate ? rutUpdate.rut : existing.rut;
    const resultingPlate = "vehiclePlate" in plateUpdate ? plateUpdate.vehiclePlate : existing.vehiclePlate;
    if (!resultingRut && !resultingPlate) {
      return NextResponse.json(
        { success: false, error: "Debe especificar al menos RUT o patente" },
        { status: 400 }
      );
    }

    const entry = await prisma.accessControlList.update({
      where: { id },
      data: {
        ...rutUpdate,
        ...plateUpdate,
        fullName: body.fullName,
        company: body.company,
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        allowedDays: body.allowedDays,
        allowedTimeFrom: body.allowedTimeFrom,
        allowedTimeTo: body.allowedTimeTo,
        recordType: body.recordType ?? undefined,
        singleUse: typeof body.singleUse === "boolean" ? body.singleUse : undefined,
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
