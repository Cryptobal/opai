import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccessControlAuth } from "@/lib/access-control/auth";
import { validateRut, cleanRut, cleanPlate } from "@/lib/access-control/utils";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.accessControlList.findUnique({
      where: { id },
      select: { installationId: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Entrada no encontrada" }, { status: 404 });
    }

    const authCtx = await requireAccessControlAuth(request, existing.installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();

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

    if (Object.keys(rutUpdate).length > 0 || Object.keys(plateUpdate).length > 0) {
      const finalRut = "rut" in rutUpdate ? rutUpdate.rut : undefined;
      const finalPlate = "vehiclePlate" in plateUpdate ? plateUpdate.vehiclePlate : undefined;

      // Check the resulting state would still satisfy the constraint
      const existingFull = await prisma.accessControlList.findUnique({
        where: { id },
        select: { rut: true, vehiclePlate: true },
      });
      const resultingRut = finalRut === undefined ? existingFull?.rut : finalRut;
      const resultingPlate = finalPlate === undefined ? existingFull?.vehiclePlate : finalPlate;
      if (!resultingRut && !resultingPlate) {
        return NextResponse.json(
          { success: false, error: "Debe especificar al menos RUT o patente" },
          { status: 400 }
        );
      }
    }

    const entry = await prisma.accessControlList.update({
      where: { id },
      data: {
        ...rutUpdate,
        ...plateUpdate,
        fullName: body.fullName,
        company: body.company,
        blockReason: body.blockReason,
        scope: body.scope,
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        allowedDays: body.allowedDays,
        allowedTimeFrom: body.allowedTimeFrom,
        allowedTimeTo: body.allowedTimeTo,
        ...(Array.isArray(body.recordTypes) || typeof body.recordType === "string"
          ? (() => {
              const arr: string[] = Array.isArray(body.recordTypes)
                ? body.recordTypes.filter((t: unknown): t is string => typeof t === "string" && t.length > 0)
                : [];
              const sing: string = typeof body.recordType === "string" && body.recordType.length > 0
                ? body.recordType
                : "visit";
              const final = arr.length > 0 ? arr : [sing];
              return { recordType: final[0], recordTypes: final };
            })()
          : {}),
        singleUse: typeof body.singleUse === "boolean" ? body.singleUse : undefined,
        isActive: body.isActive,
      },
    });

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error("[AccessControl] Error updating list entry:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar entrada" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.accessControlList.findUnique({
      where: { id },
      select: { installationId: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Entrada no encontrada" }, { status: 404 });
    }

    const authCtx = await requireAccessControlAuth(request, existing.installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    await prisma.accessControlList.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AccessControl] Error deleting list entry:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar entrada" },
      { status: 500 }
    );
  }
}
