import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { controlNocturnoId, generalNotes, controlInstalacionId, notes } =
      await request.json();

    if (controlNocturnoId && generalNotes !== undefined) {
      // Verify tenant ownership
      const cn = await prisma.opsControlNocturno.findUnique({
        where: { id: controlNocturnoId },
        select: { tenantId: true },
      });
      if (!cn || cn.tenantId !== ctx.tenantId) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      await prisma.opsControlNocturno.update({
        where: { id: controlNocturnoId },
        data: { generalNotes },
      });
    }

    if (controlInstalacionId && notes !== undefined) {
      const inst = await prisma.opsControlNocturnoInstalacion.findUnique({
        where: { id: controlInstalacionId },
        include: { controlNocturno: { select: { tenantId: true } } },
      });
      if (!inst || inst.controlNocturno.tenantId !== ctx.tenantId) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      await prisma.opsControlNocturnoInstalacion.update({
        where: { id: controlInstalacionId },
        data: { notes },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[GRID] PATCH notes", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
