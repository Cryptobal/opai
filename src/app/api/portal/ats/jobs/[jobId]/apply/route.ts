import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { getAtsConfig } from "@/lib/ats/config";
import { calcularMatchScore, type JobContext } from "@/lib/ats/match.service";
import { getPortalSessionFromRequest } from "@/lib/ats/portal-auth";

const applySchema = z.object({
  guardiaId: z.string().uuid().optional(), // Legacy — prefer JWT session
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const parsed = await parseBody(request, applySchema);
    if (parsed.error) return parsed.error;
    const { guardiaId: bodyGuardiaId } = parsed.data;

    // Resolve guardiaId from JWT session or legacy body param
    const session = await getPortalSessionFromRequest(request);
    let guardiaId: string;
    if (session) {
      guardiaId = session.guardiaId;
    } else {
      // Legacy fallback
      guardiaId = bodyGuardiaId || "";
      if (!guardiaId) {
        return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
      }
      console.warn("[ATS Portal] Legacy guardiaId auth — migrate to JWT");
    }

    const job = await prisma.atsJobPosting.findUnique({
      where: { id: jobId },
      include: { installation: { select: { lat: true, lng: true } } },
    });
    if (!job || job.estado !== "ACTIVO") {
      return NextResponse.json({ success: false, error: "Aviso no disponible" }, { status: 404 });
    }

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
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
      return NextResponse.json({ success: false, error: "Ya estás postulado a esta oferta" }, { status: 409 });
    }

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

    const application = await prisma.atsApplication.create({
      data: {
        tenantId: job.tenantId,
        jobPostingId: jobId,
        guardiaId,
        fuente: "portal_guardia",
        matchScore: match.score,
        matchDetalle: match.detalle,
      },
    });

    return NextResponse.json({ success: true, data: application }, { status: 201 });
  } catch (error) {
    console.error("[ATS] Error applying to job:", error);
    return NextResponse.json({ success: false, error: "Error al postular" }, { status: 500 });
  }
}
