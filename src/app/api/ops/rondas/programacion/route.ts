import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { rondaProgramacionSchema } from "@/lib/validations/rondas";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const templateId = request.nextUrl.searchParams.get("templateId") ?? undefined;
    const rows = await prisma.opsRondaProgramacion.findMany({
      where: { tenantId: ctx.tenantId, ...(templateId ? { rondaTemplateId: templateId } : {}) },
      include: {
        rondaTemplate: {
          select: { id: true, name: true, installation: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("[RONDAS] GET programacion", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, rondaProgramacionSchema);
    if (parsed.error) return parsed.error;

    const template = await prisma.opsRondaTemplate.findFirst({
      where: { id: parsed.data.rondaTemplateId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!template) {
      return NextResponse.json({ success: false, error: "Plantilla no encontrada" }, { status: 404 });
    }

    const row = await prisma.opsRondaProgramacion.create({
      data: {
        tenantId: ctx.tenantId,
        rondaTemplateId: parsed.data.rondaTemplateId,
        diasSemana: parsed.data.diasSemana,
        horaInicio: parsed.data.horaInicio,
        horaFin: parsed.data.horaFin,
        frecuenciaMinutos: parsed.data.frecuenciaMinutos,
        toleranciaMinutos: parsed.data.toleranciaMinutos,
        isActive: parsed.data.isActive,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (error) {
    console.error("[RONDAS] POST programacion", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
