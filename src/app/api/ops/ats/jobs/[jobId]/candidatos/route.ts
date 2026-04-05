import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { getAtsConfig } from "@/lib/ats/config";
import { resolverTopCandidatos, type JobContext } from "@/lib/ats/match.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { jobId } = await params;
    const limit = Math.min(100, parseInt(request.nextUrl.searchParams.get("limit") || "20"));

    const job = await prisma.atsJobPosting.findFirst({
      where: { id: jobId, tenantId: ctx.tenantId },
      include: {
        installation: { select: { lat: true, lng: true } },
      },
    });

    if (!job) {
      return NextResponse.json({ success: false, error: "Aviso no encontrado" }, { status: 404 });
    }

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

    const candidatos = await resolverTopCandidatos(ctx.tenantId, jobContext, config, limit);

    // Enriquecer con datos de persona
    const guardiaIds = candidatos.map((c) => c.guardiaId);
    const guardias = await prisma.opsGuardia.findMany({
      where: { id: { in: guardiaIds }, tenantId: ctx.tenantId },
      select: {
        id: true,
        code: true,
        os10: true,
        os10ExpiresAt: true,
        experienciaAnios: true,
        turnosDisponibles: true,
        lifecycleStatus: true,
        persona: {
          select: { firstName: true, lastName: true, rut: true, sex: true, commune: true, region: true },
        },
      },
    });

    const guardiaMap = new Map(guardias.map((g) => [g.id, g]));
    const enriched = candidatos.map((c) => ({
      ...c,
      guardia: guardiaMap.get(c.guardiaId) ?? null,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error("[ATS] Error getting candidates:", error);
    return NextResponse.json({ success: false, error: "Error al obtener candidatos" }, { status: 500 });
  }
}
