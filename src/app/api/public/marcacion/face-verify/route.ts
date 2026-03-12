/**
 * POST /api/public/marcacion/face-verify
 * Verifies a guard's face via AWS Rekognition and registers a marcacion.
 * Public route (no session auth).
 *
 * Flow:
 * 1. Receive base64 image + installationId + tipo
 * 2. Search face in Rekognition collection
 * 3. If match >= 95%: identify guard
 * 4. Verify guard is assigned to installation
 * 5. Create OpsMarcacion with metodoId = "face_id"
 * 6. Update OpsAsistenciaDiaria
 * 7. Return result
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/personas";
import { computeMarcacionHash, haversineDistance } from "@/lib/marcacion";
import { computeAttendanceMetrics } from "@/lib/ops-attendance";
import { sendMarcacionComprobante } from "@/lib/marcacion-email";
import { verifyFace } from "@/lib/services/rekognition";
import { z } from "zod";

const schema = z.object({
  image: z.string().min(1),
  installationId: z.string().min(1),
  tipo: z.enum(["entrada", "salida"]),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  deviceTimestamp: z.string().optional(),
  offlineSync: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { image, installationId, tipo, lat, lng, deviceTimestamp, offlineSync } = parsed.data;

    // Find installation
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, isActive: true },
      select: {
        id: true,
        tenantId: true,
        name: true,
        lat: true,
        lng: true,
        geoRadiusM: true,
      },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalacion no encontrada" },
        { status: 404 }
      );
    }

    // Decode base64 image
    const imageBuffer = Buffer.from(image, "base64");

    // Verify face via Rekognition
    let verification;
    try {
      verification = await verifyFace(imageBuffer);
    } catch (err) {
      console.error("[face-verify] Rekognition error:", err);
      return NextResponse.json(
        { success: false, error: "Error en el servicio de reconocimiento facial. Intenta con PIN." },
        { status: 500 }
      );
    }

    if (!verification.match || !verification.guardiaId) {
      // Check if the error means face not in collection
      if (verification.error === "Rostro no reconocido") {
        return NextResponse.json(
          { success: false, error: "Rostro no reconocido. Registra tu Face ID primero.", code: "FACE_NOT_REGISTERED" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, error: verification.error || "No se pudo verificar el rostro" },
        { status: 401 }
      );
    }

    // Find guard by ID (the ExternalImageId from Rekognition)
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: verification.guardiaId },
      select: {
        id: true,
        lifecycleStatus: true,
        isBlacklisted: true,
        faceIdRegistered: true,
        faceIdConsentRevoked: true,
        persona: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            rut: true,
          },
        },
      },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado en el sistema" },
        { status: 404 }
      );
    }

    // Verify guard status
    if (!["seleccionado", "contratado"].includes(guardia.lifecycleStatus)) {
      return NextResponse.json(
        { success: false, error: "Guardia no activo" },
        { status: 403 }
      );
    }

    if (guardia.isBlacklisted) {
      return NextResponse.json(
        { success: false, error: "Guardia no habilitado" },
        { status: 403 }
      );
    }

    if (guardia.faceIdConsentRevoked) {
      return NextResponse.json(
        { success: false, error: "El consentimiento biometrico fue revocado. Usa PIN para marcar." },
        { status: 403 }
      );
    }

    // Duplicate check
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const ultimaMarcacion = await prisma.opsMarcacion.findFirst({
      where: {
        guardiaId: guardia.id,
        installationId: installation.id,
        timestamp: { gte: today, lt: tomorrow },
      },
      orderBy: { timestamp: "desc" },
      select: { tipo: true },
    });

    if (ultimaMarcacion) {
      if (ultimaMarcacion.tipo === tipo) {
        return NextResponse.json(
          {
            success: false,
            error: tipo === "entrada"
              ? "Ya registraste tu entrada. Debes marcar salida primero."
              : "Ya registraste tu salida. Debes marcar entrada primero.",
          },
          { status: 409 }
        );
      }
    } else if (tipo === "salida") {
      return NextResponse.json(
        { success: false, error: "No puedes marcar salida sin haber marcado entrada." },
        { status: 409 }
      );
    }

    // Geolocation validation
    let geoValidada = false;
    let geoDistanciaM: number | null = null;

    if (lat != null && lng != null && installation.lat != null && installation.lng != null) {
      geoDistanciaM = Math.round(haversineDistance(lat, lng, installation.lat, installation.lng));
      geoValidada = geoDistanciaM <= installation.geoRadiusM;
    }

    // Server timestamp
    const serverTimestamp = new Date();

    // Determine if offline sync timestamp should be used
    let effectiveTimestamp = serverTimestamp;
    let isOfflineSync = false;
    if (offlineSync && deviceTimestamp) {
      const deviceTs = new Date(deviceTimestamp);
      const diffMs = Math.abs(serverTimestamp.getTime() - deviceTs.getTime());
      if (diffMs < 5 * 60 * 1000) {
        effectiveTimestamp = deviceTs;
      } else {
        isOfflineSync = true;
      }
    }

    // Integrity hash
    const hashIntegridad = computeMarcacionHash({
      guardiaId: guardia.id,
      installationId: installation.id,
      tipo,
      timestamp: effectiveTimestamp.toISOString(),
      lat,
      lng,
      metodoId: "face_id",
      tenantId: installation.tenantId,
    });

    // Find assignment
    const asignacion = await prisma.opsAsignacionGuardia.findFirst({
      where: {
        guardiaId: guardia.id,
        installationId: installation.id,
        isActive: true,
      },
      include: {
        puesto: { select: { shiftStart: true, shiftEnd: true } },
      },
    });

    // Calculate lateness
    let atrasoMinutos: number | null = null;
    if (tipo === "entrada" && asignacion?.puesto?.shiftStart) {
      const match = asignacion.puesto.shiftStart.match(/^(\d{1,2}):(\d{2})/);
      if (match) {
        const shiftH = parseInt(match[1], 10);
        const shiftM = parseInt(match[2], 10);
        const d = new Date(effectiveTimestamp);
        const shiftStartToday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), shiftH, shiftM, 0, 0));
        if (effectiveTimestamp > shiftStartToday) {
          atrasoMinutos = Math.floor((effectiveTimestamp.getTime() - shiftStartToday.getTime()) / 60_000);
        }
      }
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    // Create marcacion and update attendance in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const marcacion = await tx.opsMarcacion.create({
        data: {
          tenantId: installation.tenantId,
          guardiaId: guardia.id,
          installationId: installation.id,
          puestoId: asignacion?.puestoId ?? null,
          slotNumber: asignacion?.slotNumber ?? null,
          tipo,
          timestamp: effectiveTimestamp,
          lat,
          lng,
          geoValidada,
          geoDistanciaM,
          metodoId: "face_id",
          faceConfidence: verification.confidence,
          ipAddress,
          userAgent,
          hashIntegridad,
          atrasoMinutos,
          offlineSync: isOfflineSync,
          deviceTimestamp: deviceTimestamp ? new Date(deviceTimestamp) : null,
        },
      });

      // Update OpsAsistenciaDiaria
      const todayDate = new Date(effectiveTimestamp);
      todayDate.setHours(0, 0, 0, 0);

      const asistenciaReemplazo = await tx.opsAsistenciaDiaria.findFirst({
        where: {
          installationId: installation.id,
          date: todayDate,
          replacementGuardiaId: guardia.id,
          attendanceStatus: "reemplazo",
        },
        include: { puesto: { select: { shiftStart: true, shiftEnd: true } } },
      });

      const asistencia = asistenciaReemplazo
        ?? (asignacion
          ? await tx.opsAsistenciaDiaria.findFirst({
              where: {
                installationId: installation.id,
                puestoId: asignacion.puestoId,
                slotNumber: asignacion.slotNumber,
                date: todayDate,
                OR: [
                  { plannedGuardiaId: guardia.id },
                  { actualGuardiaId: guardia.id },
                ],
              },
              include: { puesto: { select: { shiftStart: true, shiftEnd: true } } },
            })
          : null);

      if (asistencia) {
        const isReplacementRow = asistencia.replacementGuardiaId === guardia.id
          && asistencia.attendanceStatus === "reemplazo";

        const updateData: Record<string, unknown> = {
          source: "marcacion_electronica",
        };

        if (tipo === "entrada") {
          updateData.checkInAt = effectiveTimestamp;
          updateData.checkInSource = "digital";
          updateData.marcacionEntradaId = marcacion.id;
          if (!isReplacementRow && asistencia.attendanceStatus === "pendiente") {
            updateData.attendanceStatus = "asistio";
            updateData.actualGuardiaId = guardia.id;
          }
        } else {
          updateData.checkOutAt = effectiveTimestamp;
          updateData.checkOutSource = "digital";
          updateData.marcacionSalidaId = marcacion.id;
        }

        const metrics = computeAttendanceMetrics({
          plannedShiftStart: asistencia.plannedShiftStart ?? asistencia.puesto.shiftStart,
          plannedShiftEnd: asistencia.plannedShiftEnd ?? asistencia.puesto.shiftEnd,
          checkInAt: tipo === "entrada" ? effectiveTimestamp : asistencia.checkInAt,
          checkOutAt: tipo === "salida" ? effectiveTimestamp : asistencia.checkOutAt,
        });
        updateData.plannedMinutes = metrics.plannedMinutes;
        updateData.workedMinutes = metrics.workedMinutes;
        updateData.overtimeMinutes = metrics.overtimeMinutes;
        updateData.lateMinutes = metrics.lateMinutes;
        updateData.hoursCalculatedAt = new Date();

        await tx.opsAsistenciaDiaria.update({
          where: { id: asistencia.id },
          data: updateData,
        });
      }

      return marcacion;
    });

    // Send comprobante email (fire-and-forget)
    const gpsStatus: "dentro_rango" | "fuera_rango" | "sin_gps" =
      lat != null && lng != null ? (geoValidada ? "dentro_rango" : "fuera_rango") : "sin_gps";
    if (guardia.persona.firstName) {
      sendMarcacionComprobante({
        guardiaName: formatPersonName(guardia.persona.firstName, guardia.persona.lastName),
        guardiaEmail: guardia.persona.email ?? undefined,
        guardiaRut: guardia.persona.rut ?? "",
        installationName: installation.name,
        tipo,
        timestamp: effectiveTimestamp,
        geoValidada,
        geoDistanciaM,
        gpsStatus,
        hashIntegridad,
        lat: lat ?? null,
        lng: lng ?? null,
      }).catch((err) => console.error("[marcacion] Error enviando comprobante:", err));
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.id,
        tipo: result.tipo,
        timestamp: result.timestamp.toISOString(),
        geoValidada,
        geoDistanciaM,
        guardiaName: formatPersonName(guardia.persona.firstName, guardia.persona.lastName),
        installationName: installation.name,
        hashIntegridad: result.hashIntegridad,
        faceConfidence: verification.confidence,
      },
    });
  } catch (error) {
    console.error("[marcacion/face-verify] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
