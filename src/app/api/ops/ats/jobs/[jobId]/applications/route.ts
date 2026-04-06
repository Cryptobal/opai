import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { getAtsConfig } from "@/lib/ats/config";
import { calcularMatchScore, type JobContext } from "@/lib/ats/match.service";
import { requireTenantModule } from '@/lib/require-module';

const createAppSchema = z.object({
  guardiaId: z.string().uuid(),
  fuente: z.string().default("directo"),
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
      select: { id: true },
    });
    if (!job) {
      return NextResponse.json({ success: false, error: "Aviso no encontrado" }, { status: 404 });
    }

    const applications = await prisma.atsApplication.findMany({
      where: { jobPostingId: jobId, tenantId: ctx.tenantId },
      include: {
        guardia: {
          select: {
            id: true,
            code: true,
            os10: true,
            os10ExpiresAt: true,
            experienciaAnios: true,
            turnosDisponibles: true,
            lifecycleStatus: true,
            persona: {
              select: { id: true, firstName: true, lastName: true, rut: true, sex: true, commune: true, region: true },
            },
          },
        },
      },
      orderBy: { matchScore: "desc" },
    });

    // Agrupar por etapa
    const pipeline: Record<string, typeof applications> = {
      POSTULADO: [],
      EN_REVISION: [],
      ENTREVISTA: [],
      OFERTA: [],
      CONTRATADO: [],
      DESCARTADO: [],
    };
    for (const app of applications) {
      if (pipeline[app.etapa]) {
        pipeline[app.etapa].push(app);
      }
    }

    return NextResponse.json({ success: true, data: { applications, pipeline } });
  } catch (error) {
    console.error("[ATS] Error listing applications:", error);
    return NextResponse.json({ success: false, error: "Error al listar postulaciones" }, { status: 500 });
  }
}

export async function POST(
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

    const parsed = await parseBody(request, createAppSchema);
    if (parsed.error) return parsed.error;
    const { guardiaId, fuente } = parsed.data;

    const job = await prisma.atsJobPosting.findFirst({
      where: { id: jobId, tenantId: ctx.tenantId },
      include: { installation: { select: { lat: true, lng: true } } },
    });
    if (!job) {
      return NextResponse.json({ success: false, error: "Aviso no encontrado" }, { status: 404 });
    }
    if (job.estado === "CERRADO") {
      return NextResponse.json({ success: false, error: "El aviso está cerrado" }, { status: 400 });
    }

    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: guardiaId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    // Check duplicate
    const existing = await prisma.atsApplication.findUnique({
      where: { jobPostingId_guardiaId: { jobPostingId: jobId, guardiaId } },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "El guardia ya está postulado a este aviso" }, { status: 409 });
    }

    // Calcular match score
    const config = await getAtsConfig(ctx.tenantId);
    const jobContext: JobContext = {
      installationLat: job.installation?.lat,
      installationLng: job.installation?.lng,
      requiereOS10: job.requiereOS10,
      requiereMovilizacion: job.requiereMovilizacion,
      turno: job.turno,
      rentaMin: job.rentaMin,
      rentaMax: job.rentaMax,
      experienciaMinAnios: job.experienciaMinAnios,
      genero: job.genero,
    };
    const match = await calcularMatchScore(guardiaId, jobContext, config);

    const application = await prisma.atsApplication.create({
      data: {
        tenantId: ctx.tenantId,
        jobPostingId: jobId,
        guardiaId,
        fuente,
        matchScore: match.score,
        matchDetalle: match.detalle,
      },
    });

    return NextResponse.json({ success: true, data: application }, { status: 201 });
  } catch (error) {
    console.error("[ATS] Error creating application:", error);
    return NextResponse.json({ success: false, error: "Error al crear postulación" }, { status: 500 });
  }
}
