import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { canView, canEdit } from "@/lib/permissions";
import { z } from "zod";

const createAssignmentSchema = z.object({
  supervisorId: z.string().min(1),
  installationId: z.string().uuid(),
  notes: z.string().max(500).optional().nullable().transform((v) => v ?? undefined),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const supervisorId = sp.get("supervisorId") ?? undefined;
    const installationId = sp.get("installationId") ?? undefined;

    const assignments = await prisma.opsAsignacionSupervisor.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        ...(supervisorId ? { supervisorId } : {}),
        ...(installationId ? { installationId } : {}),
      },
      include: {
        supervisor: { select: { id: true, name: true, email: true } },
        installation: { select: { id: true, name: true, address: true, commune: true } },
      },
      orderBy: [{ installation: { name: "asc" } }],
    });

    return NextResponse.json({ success: true, data: assignments });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error listing assignments:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "supervision")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const parsed = await parseBody(request, createAssignmentSchema);
    if (parsed.error) return parsed.error;
    const { supervisorId, installationId, notes } = parsed.data;

    const existing = await prisma.opsAsignacionSupervisor.findFirst({
      where: { supervisorId, installationId, tenantId: ctx.tenantId },
    });

    if (existing) {
      if (existing.isActive) {
        return NextResponse.json(
          { success: false, error: "Esta asignación ya existe" },
          { status: 409 },
        );
      }
      const reactivated = await prisma.opsAsignacionSupervisor.update({
        where: { id: existing.id },
        data: { isActive: true, endDate: null, startDate: new Date(), notes },
        include: {
          supervisor: { select: { id: true, name: true, email: true } },
          installation: { select: { id: true, name: true, address: true, commune: true } },
        },
      });
      return NextResponse.json({ success: true, data: reactivated }, { status: 200 });
    }

    const assignment = await prisma.opsAsignacionSupervisor.create({
      data: {
        tenantId: ctx.tenantId,
        supervisorId,
        installationId,
        startDate: new Date(),
        notes,
        createdBy: ctx.userId,
      },
      include: {
        supervisor: { select: { id: true, name: true, email: true } },
        installation: { select: { id: true, name: true, address: true, commune: true } },
      },
    });

    return NextResponse.json({ success: true, data: assignment }, { status: 201 });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error creating assignment:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "supervision")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const id = sp.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "id requerido" }, { status: 400 });
    }

    await prisma.opsAsignacionSupervisor.update({
      where: { id, tenantId: ctx.tenantId },
      data: { isActive: false, endDate: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error removing assignment:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
