/**
 * GET /api/portal/cliente/guardias/[id]
 *
 * Ficha individual del guardia para el portal del cliente.
 *
 * Acceso: el guardia debe estar asignado (currentInstallationId) a una
 * instalación presente en `session.installationIds`. De lo contrario 404.
 *
 * Privacidad (estricta):
 *  - NO exponer: rut, email, teléfono, sueldo, dirección, PIN, faceIdAwsId.
 *  - SÍ exponer: nombre sanitizado, iniciales, antigüedad, faceIdPhotoUrl,
 *    OS-10 status, documentos visibles (portalVisible en file + folder),
 *    exámenes visibles, supervisiones visibles, historial whitelisted.
 *  - Psicológico: SOLO band + scoredAt + reviewerLicense. JAMÁS score,
 *    dimensiones, alerts, openAnalysis, lieScale.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth, sanitizeGuardName } from "@/lib/portal-cliente";
import {
  computeDocEstado,
  computeOs10Estado,
  type DocEstado,
} from "@/lib/portal-cliente-guardia-doc-estado";

export const dynamic = "force-dynamic";

const HISTORIAL_WHITELIST = new Set([
  "hired",
  "terminated",
  "assigned_to_installation",
  "os10_renewed",
  "exam_passed",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 },
      );
    }

    if (session.isProspect) {
      return NextResponse.json(
        { success: false, error: "No disponible en modo demo" },
        { status: 404 },
      );
    }

    const { id: guardiaId } = await params;
    const installationIds = session.installationIds ?? [];
    if (installationIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Sin instalaciones asignadas" },
        { status: 404 },
      );
    }

    const guardia = await prisma.opsGuardia.findFirst({
      where: {
        id: guardiaId,
        tenantId: session.tenantId,
        currentInstallationId: { in: installationIds },
        status: "active",
      },
      select: {
        id: true,
        hiredAt: true,
        lifecycleStatus: true,
        os10: true,
        os10ExpiresAt: true,
        faceIdPhotoUrl: true,
        currentInstallationId: true,
        personaId: true,
        persona: { select: { firstName: true, lastName: true } },
      },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    const installation = guardia.currentInstallationId
      ? await prisma.crmInstallation.findUnique({
          where: { id: guardia.currentInstallationId },
          select: {
            id: true,
            name: true,
            address: true,
            commune: true,
          },
        })
      : null;

    const now = new Date();
    const first = guardia.persona.firstName ?? "";
    const last = guardia.persona.lastName ?? "";
    const nombre = sanitizeGuardName(first, last) || "Guardia";
    const iniciales =
      (first[0] || "").toUpperCase() + (last[0] || "").toUpperCase() || "G";

    const antiguedadMeses = guardia.hiredAt
      ? Math.max(
          0,
          Math.floor(
            (now.getTime() - guardia.hiredAt.getTime()) /
              (1000 * 60 * 60 * 24 * 30),
          ),
        )
      : 0;

    const [documents, exams, psych, supervisions, gamification] =
      await Promise.all([
        prisma.opsDocumentoPersona.findMany({
          where: {
            guardiaId: guardia.id,
            portalVisible: true,
            OR: [{ folderId: null }, { folder: { portalVisible: true } }],
          },
          select: {
            type: true,
            status: true,
            expiresAt: true,
            issuedAt: true,
            fileUrl: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.examAssignment.findMany({
          where: { guardId: guardia.id, portalVisible: true },
          select: {
            id: true,
            status: true,
            score: true,
            attemptNumber: true,
            completedAt: true,
            timeTakenSecs: true,
            exam: {
              select: { title: true, type: true, passingScore: true },
            },
          },
          orderBy: { sentAt: "desc" },
        }),
        guardia.personaId
          ? prisma.psychResult.findFirst({
              where: {
                portalVisible: true,
                assessment: {
                  tenantId: session.tenantId,
                  personaId: guardia.personaId,
                },
              },
              // Barrera de privacidad: SOLO estos campos jamás salen del server.
              select: {
                band: true,
                reviewerLicense: true,
                createdAt: true,
                assessment: { select: { scoredAt: true } },
              },
              orderBy: { createdAt: "desc" },
            })
          : Promise.resolve(null),
        prisma.opsSupervisionGuardEvaluation.findMany({
          where: {
            guardId: guardia.id,
            tenantId: session.tenantId,
            portalVisible: true,
            visit: { installationId: { in: installationIds } },
          },
          select: {
            id: true,
            presentationScore: true,
            orderScore: true,
            protocolScore: true,
            observation: true,
            isReinforcement: true,
            visit: {
              select: {
                id: true,
                checkInAt: true,
                checkOutAt: true,
                supervisor: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.gamificacionScoreGuardia.findFirst({
          where: { guardiaId: guardia.id, tenantId: session.tenantId },
          orderBy: { fechaFin: "desc" },
          select: { trustScore: true, nivelActual: true, fechaFin: true },
        }),
      ]);

    const documentos = documents.map((d) => ({
      tipo: d.type,
      estado: computeDocEstado({
        status: d.status,
        expiresAt: d.expiresAt,
        now,
      }) as DocEstado,
      expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
      issuedAt: d.issuedAt ? d.issuedAt.toISOString() : null,
      fileUrl: d.fileUrl ?? null,
    }));

    const examenesProtocolos = exams.map((e) => {
      let estado: "aprobado" | "reprobado" | "pendiente" | "expirado" =
        "pendiente";
      if (e.status === "expired") estado = "expirado";
      else if (e.status === "completed") {
        if (e.score != null && e.exam.passingScore != null) {
          estado = e.score >= e.exam.passingScore ? "aprobado" : "reprobado";
        } else {
          estado = "aprobado";
        }
      }
      return {
        id: e.id,
        examenTitulo: e.exam.title,
        examenType: e.exam.type,
        estado,
        score: e.score ?? null,
        passingScore: e.exam.passingScore,
        attemptNumber: e.attemptNumber,
        completedAt: e.completedAt ? e.completedAt.toISOString() : null,
        timeTakenSecs: e.timeTakenSecs ?? null,
      };
    });

    const psicologico = psych
      ? {
          tieneEvaluacion: true,
          band: psych.band as "ALTO" | "MEDIO" | "BAJO" | null,
          scoredAt:
            psych.assessment?.scoredAt?.toISOString() ??
            psych.createdAt?.toISOString() ??
            null,
          revisadoPorPsicologo: Boolean(psych.reviewerLicense),
        }
      : null;

    const supervision = supervisions.map((s) => ({
      visitId: s.visit.id,
      visitDate:
        (s.visit.checkOutAt ?? s.visit.checkInAt)?.toISOString() ?? null,
      supervisorName: s.visit.supervisor?.name ?? "Supervisor",
      presentationScore: s.presentationScore,
      orderScore: s.orderScore,
      protocolScore: s.protocolScore,
      observation: s.observation ?? null,
      isReinforcement: s.isReinforcement,
    }));

    const desempeno = await buildDesempeno({
      tenantId: session.tenantId,
      guardiaId: guardia.id,
      installationIds,
      now,
      gamification,
    });

    const historial = await buildHistorial(session.tenantId, guardia.id);

    return NextResponse.json({
      success: true,
      data: {
        info: {
          id: guardia.id,
          nombre,
          iniciales,
          hiredAt: guardia.hiredAt ? guardia.hiredAt.toISOString() : null,
          antiguedadMeses,
          installation: installation
            ? {
                id: installation.id,
                name: installation.name,
                address: installation.address ?? null,
                commune: installation.commune ?? null,
              }
            : null,
          turnoActual: null,
          faceIdPhotoUrl: guardia.faceIdPhotoUrl ?? null,
          os10: {
            estado: computeOs10Estado({
              os10: guardia.os10,
              os10ExpiresAt: guardia.os10ExpiresAt,
              now,
            }),
            expiresAt: guardia.os10ExpiresAt
              ? guardia.os10ExpiresAt.toISOString()
              : null,
          },
          lifecycleStatus: guardia.lifecycleStatus,
        },
        documentos,
        examenesProtocolos,
        psicologico,
        supervision,
        desempeno,
        historial,
      },
    });
  } catch (error) {
    console.error("[Portal Cliente] guardia detalle error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}

async function buildDesempeno(opts: {
  tenantId: string;
  guardiaId: string;
  installationIds: string[];
  now: Date;
  gamification: { trustScore: number; nivelActual: string; fechaFin: Date } | null;
}) {
  const { tenantId, guardiaId, now, gamification } = opts;
  const desde = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [asistencia, rondas, incidentes] = await Promise.all([
    prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId,
        actualGuardiaId: guardiaId,
        date: { gte: desde, lte: now },
      },
      select: { attendanceStatus: true },
    }),
    prisma.opsRondaEjecucion.count({
      where: {
        tenantId,
        guardiaId,
        completedAt: { gte: desde, lte: now },
        status: "completed",
      },
    }),
    prisma.opsRondaIncidente.count({
      where: {
        tenantId,
        guardiaId,
        createdAt: { gte: desde, lte: now },
      },
    }),
  ]);

  const totalDias = asistencia.length;
  const diasPresentes = asistencia.filter(
    (a) =>
      a.attendanceStatus === "trabajado" ||
      a.attendanceStatus === "presente" ||
      a.attendanceStatus === "present",
  ).length;
  const asistenciaPct = totalDias > 0 ? Math.round((diasPresentes * 100) / totalDias) : 0;

  return {
    trustScore: gamification?.trustScore ?? null,
    nivel: gamification?.nivelActual ?? null,
    asistenciaUltimos30Dias: asistenciaPct,
    rondasCompletadasUltimos30Dias: rondas,
    incidentesUltimos30Dias: incidentes,
  };
}

async function buildHistorial(tenantId: string, guardiaId: string) {
  // OpsGuardia no tiene tabla de historial dedicada que pueda reutilizar con
  // garantía. Derivamos eventos seguros de datos existentes.
  const guardia = await prisma.opsGuardia.findUnique({
    where: { id: guardiaId },
    select: {
      hiredAt: true,
      terminatedAt: true,
      tenantId: true,
      os10ExpiresAt: true,
    },
  });

  if (!guardia || guardia.tenantId !== tenantId) return [];

  const eventos: Array<{ eventType: string; createdAt: string; summary: string }> = [];

  if (guardia.hiredAt && HISTORIAL_WHITELIST.has("hired")) {
    eventos.push({
      eventType: "hired",
      createdAt: guardia.hiredAt.toISOString(),
      summary: "Guardia incorporado al equipo",
    });
  }
  if (guardia.terminatedAt && HISTORIAL_WHITELIST.has("terminated")) {
    eventos.push({
      eventType: "terminated",
      createdAt: guardia.terminatedAt.toISOString(),
      summary: "Guardia desvinculado",
    });
  }

  const examenesPassed = await prisma.examAssignment.findMany({
    where: {
      guardId: guardiaId,
      status: "completed",
      portalVisible: true,
      completedAt: { not: null },
    },
    select: {
      completedAt: true,
      score: true,
      exam: { select: { title: true, passingScore: true } },
    },
    orderBy: { completedAt: "desc" },
    take: 10,
  });

  for (const e of examenesPassed) {
    if (
      e.completedAt &&
      e.score != null &&
      e.exam.passingScore != null &&
      e.score >= e.exam.passingScore
    ) {
      eventos.push({
        eventType: "exam_passed",
        createdAt: e.completedAt.toISOString(),
        summary: `Examen aprobado: ${e.exam.title}`,
      });
    }
  }

  return eventos
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 20);
}
