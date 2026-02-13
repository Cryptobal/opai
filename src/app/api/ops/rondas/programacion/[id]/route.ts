import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { rondaProgramacionSchema } from "@/lib/validations/rondas";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });

    const row = await prisma.opsRondaProgramacion.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!row) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error("[RONDAS] GET programacion by id", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, rondaProgramacionSchema.partial());
    if (parsed.error) return parsed.error;

    const result = await prisma.opsRondaProgramacion.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: {
        diasSemana: parsed.data.diasSemana,
        horaInicio: parsed.data.horaInicio,
        horaFin: parsed.data.horaFin,
        frecuenciaMinutos: parsed.data.frecuenciaMinutos,
        toleranciaMinutos: parsed.data.toleranciaMinutos,
        isActive: parsed.data.isActive,
      },
    });
    if (result.count === 0) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] PATCH programacion", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const found = await prisma.opsRondaProgramacion.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!found) return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
    await prisma.opsRondaProgramacion.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] DELETE programacion", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
