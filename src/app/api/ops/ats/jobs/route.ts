import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { generateSlug } from "@/lib/ats/slug";

const createJobSchema = z.object({
  titulo: z.string().min(3).max(200),
  descripcion: z.string().min(10),
  turno: z.string().min(1),
  region: z.string().min(1),
  commune: z.string().optional(),
  installationId: z.string().uuid().optional(),
  rentaMin: z.number().int().positive().optional(),
  rentaMax: z.number().int().positive().optional(),
  vacantes: z.number().int().min(1).default(1),
  requiereOS10: z.boolean().default(true),
  requiereMovilizacion: z.boolean().default(false),
  genero: z.enum(["M", "F"]).optional().nullable(),
  experienciaMinAnios: z.number().int().min(0).default(0),
  funciones: z.string().optional(),
  expiraAt: z.string().datetime().optional(),
  canales: z.array(z.string()).default([]),
  notasInternas: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = request.nextUrl;
    const estado = searchParams.get("estado") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const where = {
      tenantId: ctx.tenantId,
      ...(estado ? { estado: estado as "BORRADOR" | "ACTIVO" | "PAUSADO" | "CERRADO" } : {}),
    };

    const [jobs, total] = await Promise.all([
      prisma.atsJobPosting.findMany({
        where,
        include: {
          installation: { select: { id: true, name: true } },
          _count: { select: { applications: true } },
          channels: { select: { canal: true, estado: true, activo: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.atsJobPosting.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: jobs, total, page, limit });
  } catch (error) {
    console.error("[ATS] Error listing jobs:", error);
    return NextResponse.json({ success: false, error: "Error al listar avisos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, createJobSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    if (body.rentaMin && body.rentaMax && body.rentaMin > body.rentaMax) {
      return NextResponse.json(
        { success: false, error: "La renta mínima no puede ser mayor que la máxima" },
        { status: 400 },
      );
    }

    if (body.installationId) {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: body.installationId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!inst) {
        return NextResponse.json(
          { success: false, error: "Instalación no encontrada" },
          { status: 404 },
        );
      }
    }

    const jsonLdSlug = generateSlug(body.titulo);

    const job = await prisma.atsJobPosting.create({
      data: {
        tenantId: ctx.tenantId,
        titulo: body.titulo,
        descripcion: body.descripcion,
        turno: body.turno,
        region: body.region,
        commune: body.commune,
        installationId: body.installationId,
        rentaMin: body.rentaMin,
        rentaMax: body.rentaMax,
        vacantes: body.vacantes,
        requiereOS10: body.requiereOS10,
        requiereMovilizacion: body.requiereMovilizacion,
        genero: body.genero,
        experienciaMinAnios: body.experienciaMinAnios,
        funciones: body.funciones,
        jsonLdSlug,
        expiraAt: body.expiraAt ? new Date(body.expiraAt) : undefined,
        notasInternas: body.notasInternas,
        createdById: ctx.userId,
        channels: body.canales.length > 0
          ? {
              create: body.canales.map((canal) => ({
                canal,
                activo: true,
                estado: "pendiente",
              })),
            }
          : undefined,
      },
      include: {
        channels: true,
      },
    });

    return NextResponse.json({ success: true, data: job }, { status: 201 });
  } catch (error) {
    console.error("[ATS] Error creating job:", error);
    return NextResponse.json({ success: false, error: "Error al crear aviso" }, { status: 500 });
  }
}
