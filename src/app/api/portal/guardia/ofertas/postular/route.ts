import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

/**
 * POST /api/portal/guardia/ofertas/postular
 * Body: { jobPostingId: string, guardiaId: string }
 * Creates an AtsApplication for the guard on the given job posting.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobPostingId } = body as { jobPostingId?: string };
    const guardiaId = body.guardiaId as string | undefined;

    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    if (!jobPostingId) {
      return NextResponse.json({ success: false, error: "jobPostingId es requerido" }, { status: 400 });
    }

    // Verify guard is a postulante
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardAuth.guardiaId },
      select: { lifecycleStatus: true },
    });
    if (!guardia || !["postulante", "inactivo"].includes(guardia.lifecycleStatus)) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    // Verify job exists and is active
    const job = await prisma.atsJobPosting.findUnique({
      where: { id: jobPostingId },
      select: { id: true, tenantId: true, estado: true, titulo: true },
    });
    if (!job || job.estado !== "ACTIVO") {
      return NextResponse.json({ success: false, error: "Oferta no disponible" }, { status: 404 });
    }

    // Check if already applied
    const existing = await prisma.atsApplication.findUnique({
      where: {
        jobPostingId_guardiaId: {
          jobPostingId,
          guardiaId: guardAuth.guardiaId,
        },
      },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "Ya postulaste a esta oferta" }, { status: 409 });
    }

    // Calculate match score
    let matchScore: number | null = null;
    let matchDetalle: object | null = null;
    try {
      const { calcularMatchScore } = await import("@/lib/ats/match.service");
      const { getAtsConfig } = await import("@/lib/ats/config");
      const config = await getAtsConfig(job.tenantId);
      const match = await calcularMatchScore(guardAuth.guardiaId, {
        installationLat: null,
        installationLng: null,
        requiereOS10: false,
        requiereMovilizacion: false,
        turno: "",
        rentaMin: null,
        rentaMax: null,
        experienciaMinAnios: null,
        genero: null,
      }, config);
      matchScore = match.score;
      matchDetalle = match.detalle;
    } catch {
      // Match service unavailable
    }

    const application = await prisma.atsApplication.create({
      data: {
        tenantId: job.tenantId,
        jobPostingId,
        guardiaId: guardAuth.guardiaId,
        etapa: "POSTULADO",
        fuente: "portal_guardia",
        matchScore,
        matchDetalle: matchDetalle ?? undefined,
      },
      select: { id: true },
    });

    return NextResponse.json({
      success: true,
      data: { applicationId: application.id },
    });
  } catch (error: unknown) {
    console.error("[Portal Guardia] Postular error:", error);
    return NextResponse.json({ success: false, error: "Error al postular" }, { status: 500 });
  }
}
