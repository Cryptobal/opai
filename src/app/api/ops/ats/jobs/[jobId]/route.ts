import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { requireTenantModule } from '@/lib/require-module';

const updateJobSchema = z.object({
  titulo: z.string().min(3).max(200).optional(),
  descripcion: z.string().min(10).optional(),
  turno: z.string().optional(),
  region: z.string().optional(),
  commune: z.string().optional().nullable(),
  installationId: z.string().uuid().optional().nullable(),
  rentaMin: z.number().int().positive().optional().nullable(),
  rentaMax: z.number().int().positive().optional().nullable(),
  vacantes: z.number().int().min(1).optional(),
  requiereOS10: z.boolean().optional(),
  requiereMovilizacion: z.boolean().optional(),
  genero: z.enum(["M", "F"]).optional().nullable(),
  experienciaMinAnios: z.number().int().min(0).optional(),
  funciones: z.string().optional().nullable(),
  expiraAt: z.string().datetime().optional().nullable(),
  notasInternas: z.string().optional().nullable(),
  estado: z.enum(["BORRADOR", "ACTIVO", "PAUSADO", "CERRADO"]).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const modCheck = await requireTenantModule('ats');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { jobId } = await params;

    const job = await prisma.atsJobPosting.findFirst({
      where: { id: jobId, tenantId: ctx.tenantId },
      include: {
        installation: { select: { id: true, name: true, commune: true, lat: true, lng: true } },
        channels: true,
        _count: { select: { applications: true } },
        applications: {
          select: {
            id: true,
            etapa: true,
            matchScore: true,
            fuente: true,
            createdAt: true,
            guardia: {
              select: {
                id: true,
                code: true,
                os10: true,
                os10ExpiresAt: true,
                persona: { select: { firstName: true, lastName: true, rut: true, sex: true } },
              },
            },
          },
          orderBy: { matchScore: "desc" },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ success: false, error: "Aviso no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: job });
  } catch (error) {
    console.error("[ATS] Error getting job:", error);
    return NextResponse.json({ success: false, error: "Error al obtener aviso" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const modCheck = await requireTenantModule('ats');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { jobId } = await params;

    const existing = await prisma.atsJobPosting.findFirst({
      where: { id: jobId, tenantId: ctx.tenantId },
      select: { id: true, estado: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Aviso no encontrado" }, { status: 404 });
    }
    if (existing.estado === "CERRADO") {
      return NextResponse.json({ success: false, error: "No se puede editar un aviso cerrado" }, { status: 400 });
    }

    const parsed = await parseBody(request, updateJobSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    if (body.rentaMin && body.rentaMax && body.rentaMin > body.rentaMax) {
      return NextResponse.json(
        { success: false, error: "La renta mínima no puede ser mayor que la máxima" },
        { status: 400 },
      );
    }

    const job = await prisma.atsJobPosting.update({
      where: { id: jobId },
      data: {
        ...body,
        expiraAt: body.expiraAt !== undefined ? (body.expiraAt ? new Date(body.expiraAt) : null) : undefined,
      },
    });

    return NextResponse.json({ success: true, data: job });
  } catch (error) {
    console.error("[ATS] Error updating job:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar aviso" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const modCheck = await requireTenantModule('ats');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { jobId } = await params;

    const existing = await prisma.atsJobPosting.findFirst({
      where: { id: jobId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Aviso no encontrado" }, { status: 404 });
    }

    await prisma.atsJobPosting.delete({ where: { id: jobId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ATS] Error deleting job:", error);
    return NextResponse.json({ success: false, error: "Error al eliminar aviso" }, { status: 500 });
  }
}
