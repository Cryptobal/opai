import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccessControlAuth } from "@/lib/access-control/auth";

async function authorizeByInstallation(
  request: NextRequest,
  installationId: string | null,
  groupId: string,
) {
  if (!installationId) {
    return { error: "installationId es requerido", authCtx: null as null };
  }
  const authCtx = await requireAccessControlAuth(request, installationId);
  if (!authCtx) {
    return { error: "No autorizado", authCtx: null as null };
  }
  const group = await prisma.accessControlListGroup.findFirst({
    where: {
      id: groupId,
      tenantId: authCtx.tenantId,
      installationLinks: { some: { installationId } },
    },
    select: { id: true, tenantId: true },
  });
  if (!group) {
    return { error: "Grupo no encontrado", authCtx: null as null };
  }
  return { error: null as string | null, authCtx };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await params;
    const body = (await request.json()) as {
      installationId?: string;
      name?: string;
      description?: string | null;
      isActive?: boolean;
    };
    const { error } = await authorizeByInstallation(
      request,
      body.installationId ?? null,
      groupId,
    );
    if (error) {
      return NextResponse.json(
        { success: false, error },
        { status: error === "No autorizado" ? 401 : error === "installationId es requerido" ? 400 : 404 },
      );
    }

    const updateData: {
      name?: string;
      description?: string | null;
      isActive?: boolean;
    } = {};
    if (typeof body.name === "string" && body.name.trim()) updateData.name = body.name.trim();
    if ("description" in body) updateData.description = body.description?.trim() || null;
    if (typeof body.isActive === "boolean") updateData.isActive = body.isActive;

    const result = await prisma.accessControlListGroup.update({
      where: { id: groupId },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[AccessControl] Error updating group:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar grupo" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await params;
    const url = new URL(request.url);
    const installationId = url.searchParams.get("installationId");
    const { error } = await authorizeByInstallation(request, installationId, groupId);
    if (error) {
      return NextResponse.json(
        { success: false, error },
        { status: error === "No autorizado" ? 401 : error === "installationId es requerido" ? 400 : 404 },
      );
    }

    await prisma.accessControlListGroup.update({
      where: { id: groupId },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AccessControl] Error deleting group:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar grupo" },
      { status: 500 },
    );
  }
}
