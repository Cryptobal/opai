/**
 * PATCH / DELETE /api/finance/config/dte-provider/cafs/[id]
 *
 * PATCH: toggle isActive del CAF.
 * DELETE: elimina el CAF (también limpia el FolioTracker si apuntaba a él).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "rendicion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const existing = await prisma.tenantDteCaf.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "CAF no encontrado" },
      { status: 404 }
    );
  }

  const updated = await prisma.tenantDteCaf.update({
    where: { id },
    data: {
      isActive:
        body && typeof body.isActive === "boolean" ? body.isActive : undefined,
    },
    select: {
      id: true,
      dteType: true,
      folioDesde: true,
      folioHasta: true,
      rutEmisor: true,
      fechaAutorizacion: true,
      fileName: true,
      isActive: true,
      uploadedAt: true,
    },
  });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "rendicion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }
  const { id } = await params;

  const existing = await prisma.tenantDteCaf.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "CAF no encontrado" },
      { status: 404 }
    );
  }

  await prisma.$transaction(async (tx) => {
    // Limpiar tracker si apuntaba a este CAF — el próximo issue elegirá uno nuevo.
    await tx.tenantDteFolioTracker.deleteMany({
      where: { tenantId: ctx.tenantId, dteType: existing.dteType, cafId: id },
    });
    await tx.tenantDteCaf.delete({ where: { id } });
  });

  return NextResponse.json({ success: true });
}
