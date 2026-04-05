import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

/**
 * GET /api/portal/guardia/ofertas?guardiaId=xxx
 * Lists active job postings across all tenants, sorted by match score.
 * Only accessible to postulante guards.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const guardiaId = searchParams.get("guardiaId");
  const guardAuth = await requirePortalGuardiaAuth(guardiaId);
  if (!guardAuth) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  // Verify guard is a postulante
  const guardia = await prisma.opsGuardia.findUnique({
    where: { id: guardAuth.guardiaId },
    select: { lifecycleStatus: true },
  });
  if (!guardia || !["postulante", "inactivo"].includes(guardia.lifecycleStatus)) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
  }

  // Get all existing application job IDs to exclude
  const existingApps = await prisma.atsApplication.findMany({
    where: { guardiaId: guardAuth.guardiaId },
    select: { jobPostingId: true },
  });
  const appliedJobIds = new Set(existingApps.map((a: { jobPostingId: string }) => a.jobPostingId));

  // Get active job postings
  const jobs = await prisma.atsJobPosting.findMany({
    where: {
      estado: "ACTIVO",
      ...(appliedJobIds.size > 0
        ? { id: { notIn: Array.from(appliedJobIds) } }
        : {}),
    },
    select: {
      id: true,
      titulo: true,
      descripcion: true,
      region: true,
      commune: true,
      turno: true,
      vacantes: true,
      rentaMin: true,
      rentaMax: true,
      requiereOS10: true,
      requiereMovilizacion: true,
      experienciaMinAnios: true,
      createdAt: true,
      tenant: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Try to calculate match scores
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jobsWithScore: Array<any>;
  try {
    const { calcularMatchScore } = await import("@/lib/ats/match.service");
    const { getAtsConfig } = await import("@/lib/ats/config");
    const config = await getAtsConfig(guardAuth.tenantId);

    jobsWithScore = await Promise.all(
      jobs.map(async (job: (typeof jobs)[number]) => {
        try {
          const match = await calcularMatchScore(guardAuth.guardiaId, {
            installationLat: null,
            installationLng: null,
            requiereOS10: job.requiereOS10,
            requiereMovilizacion: job.requiereMovilizacion,
            turno: job.turno,
            rentaMin: job.rentaMin,
            rentaMax: job.rentaMax,
            experienciaMinAnios: job.experienciaMinAnios,
            genero: null,
          }, config);
          return { ...job, matchScore: match.score };
        } catch {
          return { ...job, matchScore: 0 };
        }
      }),
    );

    // Sort by match score descending
    jobsWithScore.sort((a: { matchScore: number }, b: { matchScore: number }) => b.matchScore - a.matchScore);
  } catch {
    // Match service unavailable — return unsorted
    jobsWithScore = jobs.map((j: (typeof jobs)[number]) => ({ ...j, matchScore: 0 }));
  }

  return NextResponse.json({ success: true, data: jobsWithScore });
}
