import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAtsConfig } from "@/lib/ats/config";
import { calcularMatchScore, type JobContext } from "@/lib/ats/match.service";
import { getPortalSessionFromRequest } from "@/lib/ats/portal-auth";

export async function GET(request: NextRequest) {
  try {
    const turno = request.nextUrl.searchParams.get("turno") || undefined;
    const region = request.nextUrl.searchParams.get("region") || undefined;
    const rentaMin = request.nextUrl.searchParams.get("rentaMin");

    // Resolve guardiaId from JWT session or legacy query param
    const session = await getPortalSessionFromRequest(request);
    let guardiaId: string;
    if (session) {
      guardiaId = session.guardiaId;
    } else {
      // Legacy fallback
      guardiaId = request.nextUrl.searchParams.get("guardiaId") || "";
      if (!guardiaId) {
        return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
      }
      console.warn("[ATS Portal] Legacy guardiaId auth — migrate to JWT");
    }

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { id: true, tenantId: true },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const jobs = await prisma.atsJobPosting.findMany({
      where: {
        estado: "ACTIVO",
        ...(turno ? { turno } : {}),
        ...(region ? { region } : {}),
        ...(rentaMin ? { rentaMax: { gte: parseInt(rentaMin) } } : {}),
      },
      include: {
        tenant: { select: { name: true } },
        installation: { select: { name: true, commune: true, lat: true, lng: true } },
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Calcular match score para cada job
    const jobsWithMatch = await Promise.all(
      jobs.map(async (job) => {
        const config = await getAtsConfig(job.tenantId);
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

        // Check if already applied
        const existing = await prisma.atsApplication.findUnique({
          where: { jobPostingId_guardiaId: { jobPostingId: job.id, guardiaId } },
          select: { id: true, etapa: true },
        });

        return {
          id: job.id,
          titulo: job.titulo,
          descripcion: job.descripcion.slice(0, 200),
          turno: job.turno,
          region: job.region,
          commune: job.commune,
          rentaMin: job.rentaMin,
          rentaMax: job.rentaMax,
          vacantes: job.vacantes,
          requiereOS10: job.requiereOS10,
          tenantName: job.tenant.name,
          installationName: job.installation?.name,
          matchScore: config.mostrarScoreAlGuardia ? match.score : null,
          yaPostulado: !!existing,
          etapa: existing?.etapa ?? null,
          createdAt: job.createdAt,
          _sortScore: match.score,
        };
      }),
    );

    // Sort by match score
    jobsWithMatch.sort((a, b) => b._sortScore - a._sortScore);

    return NextResponse.json({
      success: true,
      data: jobsWithMatch.map(({ _sortScore, ...rest }) => rest),
    });
  } catch (error) {
    console.error("[ATS] Error listing portal jobs:", error);
    return NextResponse.json({ success: false, error: "Error al listar ofertas" }, { status: 500 });
  }
}
