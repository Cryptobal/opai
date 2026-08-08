import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

type RouteParams = { params: Promise<{ installationId: string; deviceId: string }> };

async function findScopedDevice(
  ctx: { tenantId: string },
  installationId: string,
  deviceId: string,
) {
  return prisma.devicePairing.findFirst({
    where: {
      id: deviceId,
      tenantId: ctx.tenantId,
      installationId,
    },
    select: { id: true },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { installationId, deviceId } = await params;

    const device = await findScopedDevice(ctx, installationId, deviceId);
    if (!device) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no encontrado" },
        { status: 404 }
      );
    }

    await prisma.devicePairing.update({
      where: { id: device.id, tenantId: ctx.tenantId, installationId },
      data: { status: "REVOKED" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[devices/admin/revoke] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al revocar dispositivo" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { installationId, deviceId } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (typeof body.portalRondasEnabled === "boolean")
      updateData.portalRondasEnabled = body.portalRondasEnabled;
    if (typeof body.portalAccesoEnabled === "boolean")
      updateData.portalAccesoEnabled = body.portalAccesoEnabled;
    if (typeof body.portalMarcacionEnabled === "boolean")
      updateData.portalMarcacionEnabled = body.portalMarcacionEnabled;
    if (typeof body.name === "string")
      updateData.name = body.name;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: "No se proporcionaron campos a actualizar" },
        { status: 400 }
      );
    }

    const device = await findScopedDevice(ctx, installationId, deviceId);
    if (!device) {
      return NextResponse.json(
        { success: false, error: "Dispositivo no encontrado" },
        { status: 404 }
      );
    }

    const updated = await prisma.devicePairing.update({
      where: { id: device.id, tenantId: ctx.tenantId, installationId },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[devices/admin/update] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar dispositivo" },
      { status: 500 }
    );
  }
}
