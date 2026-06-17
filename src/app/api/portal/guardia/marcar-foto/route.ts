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
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";
import { computeMarcacionHash, haversineDistance } from "@/lib/marcacion";
import { sendMarcacionComprobante, sendNotificacionFueraDeRango } from "@/lib/marcacion-email";
import { parseMarcacionConfigValue, resolveMarcacionGeoRadiusM } from "@/lib/ops-marcacion-config";
import { computeAttendanceMetrics } from "@/lib/ops-attendance";
import { formatPersonName } from "@/lib/personas";
import { uploadMarcacionPhoto } from "@/lib/marcacion-photo";
import { verifyFace } from "@/lib/services/rekognition";
import {
  resolverProximoTipo,
  calcularAtrasoMinutos,
  chileDayStart,
  buscarMarcacionPorIdempotencyKey,
  ejecutarConDedup,
  resolverTrazabilidadMarca,
} from "@/lib/marcacion-jornada";
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
  idempotencyKey: z.string().min(8).max(120).optional(),
  deviceTimestamp: z.string().datetime().optional(),
  origenMarca: z.enum(["online", "offline_queue", "retry", "sync_diferida"]).optional(),
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

    const { guardiaId, tipo, lat, lng, gpsAccuracy, image, idempotencyKey } = parsed.data;

    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado o inactivo" }, { status: 401 });
    }
    const tenantId = guardAuth.tenantId;

    // Validate guard exists and is active
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: guardAuth.guardiaId, tenantId },
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

    // Idempotencia: si ya existe una marca con esta key (doble-tap / retry), no
    // repetir el trabajo (incluida la verificación facial) y devolver la ganadora.
    if (idempotencyKey) {
      const dup = await buscarMarcacionPorIdempotencyKey(prisma, tenantId, idempotencyKey);
      if (dup) {
        return NextResponse.json({
          success: true,
          deduplicated: true,
          id: dup.id,
          tipo: dup.tipo,
          timestamp: dup.timestamp.toISOString(),
        });
      }
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

    // Duplicate check — resolver entrada/salida por la última marca real en una
    // ventana de 26h (robusto a turnos nocturnos y al cruce de medianoche UTC).
    const tipoEsperado = await resolverProximoTipo(prisma, {
      guardiaId: guardia.id,
      tenantId,
      installationId: installation.id,
    });

    if (tipoEsperado !== tipo) {
      return NextResponse.json(
        {
          success: false,
          error: tipo === "entrada"
            ? "Ya registraste tu entrada. Debes marcar salida primero."
            : "No puedes marcar salida sin haber marcado entrada.",
        },
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
    const fotoEvidenciaUrl = await uploadMarcacionPhoto(image, guardia.id, tipo, tenantId);

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

    // Trazabilidad de marca tardía/offline (no cambia el timestamp del servidor)
    const traza = resolverTrazabilidadMarca({
      serverTimestamp,
      deviceTimestamp: parsed.data.deviceTimestamp,
      origenMarca: parsed.data.origenMarca,
    });

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

    // Late minutes calculation (shiftStart interpretado como hora Chile)
    const atrasoMinutos =
      tipo === "entrada"
        ? calcularAtrasoMinutos(asignacion.puesto?.shiftStart, serverTimestamp)
        : null;

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    // Tenant company config for Res. N°38 employer data
    const { getTenantCompanyConfig } = await import("@/lib/tenant-config");
    const tenantCfg = await getTenantCompanyConfig(tenantId);

    // Create marcacion + update daily attendance in transaction
    const outcome = await ejecutarConDedup(
      () => prisma.$transaction(async (tx) => {
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
          // Idempotencia + trazabilidad de marca tardía/offline
          idempotencyKey: idempotencyKey ?? null,
          deviceTimestamp: traza.deviceTs,
          offlineSync: traza.offlineSync,
          origenMarca: traza.origenMarca,
          // No devicePairingId — this is from the guard's personal device
        },
      });

      // Update OpsAsistenciaDiaria if exists for today (día-calendario Chile)
      const todayDate = chileDayStart(serverTimestamp);

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
      }),
      { db: prisma, tenantId, idempotencyKey },
    );

    if (!outcome.ok) {
      return NextResponse.json({
        success: true,
        deduplicated: true,
        id: outcome.dup.id,
        tipo: outcome.dup.tipo,
        timestamp: outcome.dup.timestamp.toISOString(),
      });
    }
    const result = outcome.value;

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
