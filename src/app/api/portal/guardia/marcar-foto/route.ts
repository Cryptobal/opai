/**
 * POST /api/portal/guardia/marcar-foto
 * Registra marcacion desde el portal del guardia con foto de evidencia.
 * Si el guardia tiene Face ID registrado, intenta verificar via Rekognition.
 * Si falla o no coincide, continua con metodo "foto_evidencia".
 *
 * Cumplimiento Resolucion Exenta N°38:
 * - GPS como evidencia, NUNCA bloquea la marcacion
 * - Hash SHA-256 de integridad
 * - Sello de tiempo del servidor
 * - Comprobante electronico al trabajador
 */

import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeMarcacionHash, haversineDistance } from "@/lib/marcacion";
import { sendMarcacionComprobante, sendNotificacionFueraDeRango } from "@/lib/marcacion-email";
import { parseMarcacionConfigValue, resolveMarcacionGeoRadiusM } from "@/lib/ops-marcacion-config";
import { computeAttendanceMetrics } from "@/lib/ops-attendance";
import { formatPersonName } from "@/lib/personas";
import { uploadMarcacionPhoto } from "@/lib/marcacion-photo";
import { verifyFace } from "@/lib/services/rekognition";
import { z } from "zod";

// -- POST: Register marcacion with photo --

const postSchema = z.object({
  guardiaId: z.string().uuid(),
  tenantId: z.string().min(1),
  tipo: z.enum(["entrada", "salida"]),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  gpsAccuracy: z.number().nullable().optional(),
  image: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { guardiaId, tenantId, tipo, lat, lng, gpsAccuracy, image } = parsed.data;

    // Validate guard exists and is active
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: guardiaId, tenantId },
      select: {
        id: true,
        lifecycleStatus: true,
        isBlacklisted: true,
        code: true,
        dtResolucionJornada: true,
        personalEmail: true,
        faceIdRegistered: true,
        persona: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rut: true,
            email: true,
            personalEmail: true,
          },
        },
      },
    });

    if (!guardia || !guardia.persona) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    if (!["seleccionado", "contratado"].includes(guardia.lifecycleStatus)) {
      return NextResponse.json({ success: false, error: "Guardia no activo" }, { status: 403 });
    }

    if (guardia.isBlacklisted) {
      return NextResponse.json({ success: false, error: "Guardia no habilitado" }, { status: 403 });
    }

    // Find guard's current active assignment to get installation
    const asignacion = await prisma.opsAsignacionGuardia.findFirst({
      where: {
        guardiaId: guardia.id,
        isActive: true,
      },
      include: {
        installation: {
          select: {
            id: true,
            name: true,
            address: true,
            lat: true,
            lng: true,
            geoRadiusM: true,
          },
        },
        puesto: { select: { shiftStart: true, shiftEnd: true } },
      },
    });

    if (!asignacion?.installation) {
      return NextResponse.json(
        { success: false, error: "No tienes una instalacion asignada actualmente." },
        { status: 400 }
      );
    }

    const installation = asignacion.installation;

    // Marcacion config
    const marcacionConfigSetting = await prisma.setting.findFirst({
      where: { key: `marcacion_config:${tenantId}` },
      select: { value: true },
    });
    const marcacionConfig = parseMarcacionConfigValue(marcacionConfigSetting?.value);
    const effectiveGeoRadiusM = resolveMarcacionGeoRadiusM(marcacionConfig, installation.geoRadiusM);

    // Duplicate check — no two consecutive same-type marks
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const ultimaMarcacion = await prisma.opsMarcacion.findFirst({
      where: {
        guardiaId: guardia.id,
        installationId: installation.id,
        timestamp: { gte: today, lt: tomorrow },
        deletedAt: null,
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

    // Face verification (if registered) + evidence photo upload
    let metodoId = "foto_evidencia";
    let faceConfidence: number | null = null;

    if (guardia.faceIdRegistered) {
      try {
        const imageBuffer = Buffer.from(image, "base64");
        const verification = await verifyFace(imageBuffer);
        if (verification.match && verification.guardiaId === guardia.id) {
          metodoId = "face_id";
          faceConfidence = verification.confidence ?? null;
        }
      } catch {
        // Rekognition error — continue with foto_evidencia
      }
    }

    // Upload evidence photo to R2 (non-blocking)
    const fotoEvidenciaUrl = await uploadMarcacionPhoto(image, guardia.id, tipo);

    // -- GEOLOCALIZACION COMO EVIDENCIA (Res. Exenta N°38) --
    // GPS es EVIDENCIA, nunca restriccion. No se bloquea la marcacion por ubicacion.
    let geoValidada = false;
    let geoDistanciaM: number | null = null;
    let gpsStatus: "dentro_rango" | "fuera_rango" | "sin_gps" = "sin_gps";

    if (lat != null && lng != null && installation.lat != null && installation.lng != null) {
      geoDistanciaM = Math.round(
        haversineDistance(lat, lng, installation.lat, installation.lng)
      );
      geoValidada = geoDistanciaM <= effectiveGeoRadiusM;
      gpsStatus = geoValidada ? "dentro_rango" : "fuera_rango";
    }

    // Server timestamp
    const serverTimestamp = new Date();

    // SHA-256 integrity hash (Resolucion Exenta N°38)
    const hashIntegridad = computeMarcacionHash({
      guardiaId: guardia.id,
      installationId: installation.id,
      tipo,
      timestamp: serverTimestamp.toISOString(),
      lat: lat ?? null,
      lng: lng ?? null,
      metodoId,
      tenantId,
    });

    // Late minutes calculation
    let atrasoMinutos: number | null = null;
    if (tipo === "entrada" && asignacion.puesto?.shiftStart) {
      const match = asignacion.puesto.shiftStart.match(/^(\d{1,2}):(\d{2})/);
      if (match) {
        const shiftH = parseInt(match[1], 10);
        const shiftM = parseInt(match[2], 10);
        const d = new Date(serverTimestamp);
        const shiftStartToday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), shiftH, shiftM, 0, 0));
        if (serverTimestamp > shiftStartToday) {
          atrasoMinutos = Math.floor((serverTimestamp.getTime() - shiftStartToday.getTime()) / 60_000);
        }
      }
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    // Tenant company config for Res. N°38 employer data
    const { getTenantCompanyConfig } = await import("@/lib/tenant-config");
    const tenantCfg = await getTenantCompanyConfig(tenantId);

    // Create marcacion + update daily attendance in transaction
    const result = await prisma.$transaction(async (tx) => {
      const marcacion = await tx.opsMarcacion.create({
        data: {
          tenantId,
          guardiaId: guardia.id,
          installationId: installation.id,
          puestoId: asignacion.puestoId,
          slotNumber: asignacion.slotNumber,
          tipo,
          timestamp: serverTimestamp,
          lat: lat ?? null,
          lng: lng ?? null,
          geoValidada,
          geoDistanciaM,
          metodoId,
          faceConfidence,
          fotoEvidenciaUrl,
          ipAddress,
          userAgent: userAgent ? `portal-guardia ${userAgent}` : "portal-guardia",
          hashIntegridad,
          atrasoMinutos,
          // Resolucion Exenta N°38 — mandatory fields
          employerRut: tenantCfg.rut,
          employerName: tenantCfg.razonSocial,
          establishmentAddress: installation.address,
          dtResolutionNumber: guardia.dtResolucionJornada,
          gpsStatus,
          distanciaMetros: geoDistanciaM,
          gpsAccuracy: gpsAccuracy ?? null,
          // No devicePairingId — this is from the guard's personal device
        },
      });

      // Update OpsAsistenciaDiaria if exists for today
      const todayDate = new Date(serverTimestamp);
      todayDate.setHours(0, 0, 0, 0);

      // Check replacement first
      const asistenciaReemplazo = await tx.opsAsistenciaDiaria.findFirst({
        where: {
          installationId: installation.id,
          date: todayDate,
          replacementGuardiaId: guardia.id,
          attendanceStatus: "reemplazo",
        },
        include: {
          puesto: { select: { shiftStart: true, shiftEnd: true } },
        },
      });

      const asistencia = asistenciaReemplazo
        ?? await tx.opsAsistenciaDiaria.findFirst({
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
            include: {
              puesto: { select: { shiftStart: true, shiftEnd: true } },
            },
          });

      if (asistencia) {
        const isReplacementRow = asistencia.replacementGuardiaId === guardia.id
          && asistencia.attendanceStatus === "reemplazo";

        const updateData: Record<string, unknown> = {
          source: "marcacion_electronica",
        };
        if (tipo === "entrada") {
          updateData.checkInAt = serverTimestamp;
          updateData.checkInSource = "digital";
          updateData.marcacionEntradaId = marcacion.id;
          if (!isReplacementRow && asistencia.attendanceStatus === "pendiente") {
            updateData.attendanceStatus = "asistio";
            updateData.actualGuardiaId = guardia.id;
          }
        } else {
          updateData.checkOutAt = serverTimestamp;
          updateData.checkOutSource = "digital";
          updateData.marcacionSalidaId = marcacion.id;
        }

        const metrics = computeAttendanceMetrics({
          plannedShiftStart: asistencia.plannedShiftStart ?? asistencia.puesto.shiftStart,
          plannedShiftEnd: asistencia.plannedShiftEnd ?? asistencia.puesto.shiftEnd,
          checkInAt: tipo === "entrada" ? serverTimestamp : asistencia.checkInAt,
          checkOutAt: tipo === "salida" ? serverTimestamp : asistencia.checkOutAt,
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

    // Send receipt email (fire-and-forget, Res. N°38)
    const guardiaEmail = guardia.personalEmail ?? guardia.persona.personalEmail ?? guardia.persona.email ?? undefined;
    if (marcacionConfig.emailComprobanteDigitalEnabled && guardiaEmail) {
      sendMarcacionComprobante({
        guardiaName: formatPersonName(guardia.persona.firstName, guardia.persona.lastName),
        guardiaEmail,
        guardiaRut: guardia.persona.rut ?? "",
        installationName: installation.name,
        tipo,
        timestamp: serverTimestamp,
        geoValidada,
        geoDistanciaM,
        gpsStatus,
        hashIntegridad,
        lat: lat ?? null,
        lng: lng ?? null,
      }).catch((err) => console.error("[portal-guardia/marcar-foto] Error enviando comprobante:", err));
    }

    // Alerta fuera de rango: after() evita que el envío se pierda al cerrar el runtime serverless al responder.
    if (gpsStatus === "fuera_rango") {
      after(async () => {
        try {
          await sendNotificacionFueraDeRango({
            tenantId,
            installationId: installation.id,
            installationName: installation.name,
            installationLat: installation.lat,
            installationLng: installation.lng,
            guardiaName: formatPersonName(guardia.persona.firstName, guardia.persona.lastName),
            guardiaRut: guardia.persona.rut ?? "",
            tipo,
            timestamp: serverTimestamp,
            geoDistanciaM,
            geoRadiusM: effectiveGeoRadiusM,
            lat: lat ?? null,
            lng: lng ?? null,
            deviceDisplay: "Portal Guardia (celular personal)",
          });
        } catch (err) {
          console.error("[portal-guardia/marcar-foto] Error notificando fuera de rango:", err);
        }
      });
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      tipo: result.tipo,
      timestamp: result.timestamp.toISOString(),
      geoValidada,
      geoDistanciaM,
      gpsStatus,
      metodoId,
      faceConfidence,
      fotoEvidenciaUrl,
      guardiaName: formatPersonName(guardia.persona.firstName, guardia.persona.lastName),
      installationName: installation.name,
      hashIntegridad: result.hashIntegridad,
    });
  } catch (error) {
    console.error("[portal-guardia/marcar-foto] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
