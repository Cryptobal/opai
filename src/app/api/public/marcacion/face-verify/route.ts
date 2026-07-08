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
import { parseMarcacionConfigValue, resolveMarcacionGeoRadiusM } from "@/lib/ops-marcacion-config";
import { verifyFace } from "@/lib/services/rekognition";
import { uploadMarcacionPhoto } from "@/lib/marcacion-photo";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolverProximoTipo, calcularAtrasoMinutos, chileDayStart } from "@/lib/marcacion-jornada";

const schema = z.object({
  image: z.string().min(1),
  installationId: z.string().min(1),
  tipo: z.enum(["entrada", "salida"]),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  deviceTimestamp: z.string().optional(),
  offlineSync: z.boolean().optional(),
  // Optional: expected guardiaId from lookup step — cross-validates the face match
  expectedGuardiaId: z.string().optional(),
  // Dispositivo del portal (DevicePairing) — para identificar equipo usado
  deviceToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { allowed } = checkRateLimit(`face-verify:${ip}`, { limit: 15, windowSeconds: 60 });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Demasiados intentos. Intente nuevamente en un momento." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { image, installationId, tipo, lat, lng, deviceTimestamp, offlineSync, expectedGuardiaId, deviceToken } = parsed.data;

    // GPS obligatorio — sin ubicación no hay marcación
    if (lat == null || lng == null) {
      return NextResponse.json(
        { success: false, error: "Ubicación GPS requerida" },
        { status: 400 }
      );
    }

    // Find installation
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, status: "active" },
      select: {
        id: true,
        tenantId: true,
        name: true,
        address: true,
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

    const marcacionConfigSetting = await prisma.setting.findFirst({
      where: { key: `marcacion_config:${installation.tenantId}` },
      select: { value: true },
    });
    const marcacionConfig = parseMarcacionConfigValue(marcacionConfigSetting?.value);
    const effectiveGeoRadiusM = resolveMarcacionGeoRadiusM(marcacionConfig, installation.geoRadiusM);

    // Resolver DevicePairing si viene deviceToken (portal marcación)
    let devicePairingId: string | null = null;
    if (deviceToken) {
      const device = await prisma.devicePairing.findFirst({
        where: { deviceToken, status: "ACTIVE", installationId: installation.id },
        select: { id: true },
      });
      if (device) devicePairingId = device.id;
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
      // CRITICAL: When expectedGuardiaId is provided (user identified via RUT), the guard
      // already has faceIdRegistered (frontend only shows camera when true). So a failed
      // verification means WRONG PERSON (face mismatch), NEVER offer enrollment.
      if (expectedGuardiaId) {
        const expectedGuard = await prisma.opsGuardia.findUnique({
          where: { id: expectedGuardiaId },
          select: {
            faceIdRegistered: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        });
        if (expectedGuard?.faceIdRegistered) {
          const nombre = expectedGuard.persona
            ? `${expectedGuard.persona.firstName ?? ""} ${expectedGuard.persona.lastName ?? ""}`.trim() || "el guardia"
            : "el guardia";
          return NextResponse.json(
            {
              success: false,
              error: `El rostro no coincide con el registrado para ${nombre}. Intente nuevamente o use PIN como fallback.`,
              code: "FACE_MISMATCH",
            },
            { status: 401 }
          );
        }
      }
      // No expectedGuardiaId or guard has no Face ID: offer enrollment only when face not in collection
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

    // Cross-validate: if lookup step identified a specific guardia, ensure it matches
    if (expectedGuardiaId && verification.guardiaId !== expectedGuardiaId) {
      const expectedGuard = await prisma.opsGuardia.findUnique({
        where: { id: expectedGuardiaId },
        select: { persona: { select: { firstName: true, lastName: true } } },
      });
      const nombre = expectedGuard?.persona
        ? `${expectedGuard.persona.firstName ?? ""} ${expectedGuard.persona.lastName ?? ""}`.trim() || "el guardia"
        : "el guardia";
      return NextResponse.json(
        {
          success: false,
          error: `El rostro no coincide con el registrado para ${nombre}. Intente nuevamente o use PIN como fallback.`,
          code: "FACE_MISMATCH",
        },
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
        personalEmail: true,
        dtResolucionJornada: true,
        persona: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            personalEmail: true,
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

    // Duplicate check — resolver entrada/salida por la última marca real en una
    // ventana de 26h (robusto a turnos nocturnos y al cruce de medianoche UTC).
    const tipoEsperado = await resolverProximoTipo(prisma, {
      guardiaId: guardia.id,
      tenantId: installation.tenantId,
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

    // Geolocation validation
    let geoValidada = false;
    let geoDistanciaM: number | null = null;

    if (lat != null && lng != null && installation.lat != null && installation.lng != null) {
      geoDistanciaM = Math.round(haversineDistance(lat, lng, installation.lat, installation.lng));
      geoValidada = geoDistanciaM <= effectiveGeoRadiusM;
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

    // Calculate lateness (shiftStart interpretado como hora Chile)
    const atrasoMinutos =
      tipo === "entrada"
        ? calcularAtrasoMinutos(asignacion?.puesto?.shiftStart, effectiveTimestamp)
        : null;

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    // Geolocation status
    const gpsStatus: "dentro_rango" | "fuera_rango" | "sin_gps" =
      lat != null && lng != null ? (geoValidada ? "dentro_rango" : "fuera_rango") : "sin_gps";

    // Obtener datos del empleador desde configuración del tenant
    const { getTenantCompanyConfig } = await import("@/lib/tenant-config");
    const tenantCfg = await getTenantCompanyConfig(installation.tenantId);

    // Upload evidence photo to R2 (if fails, marcacion still proceeds)
    const fotoEvidenciaUrl = await uploadMarcacionPhoto(image, guardia.id, tipo, installation.tenantId);

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
          // Resolución Exenta N°38 — Datos obligatorios
          employerRut: tenantCfg.rut,
          employerName: tenantCfg.razonSocial,
          establishmentAddress: installation.address,
          dtResolutionNumber: guardia.dtResolucionJornada,
          gpsStatus,
          distanciaMetros: geoDistanciaM,
          devicePairingId,
          fotoEvidenciaUrl,
        },
      });

      // Update OpsAsistenciaDiaria (día-calendario Chile)
      const todayDate = chileDayStart(effectiveTimestamp);

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
          // La marca del guardia cierra el ciclo de central: pendiente y
          // en_camino (llamado por central) pasan a asistió al llegar la marca.
          if (
            !isReplacementRow &&
            (asistencia.attendanceStatus === "pendiente" ||
              asistencia.attendanceStatus === "en_camino")
          ) {
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

    // Refresca el tablero de relevo activo (semáforo → presente). No-op si no
    // hay tablero OPEN. Fire-and-forget.
    import("@/lib/ops/relevo-board")
      .then((m) =>
        m.refreshRelevoBoardForInstallation(
          installation.tenantId,
          installation.id,
          chileDayStart(effectiveTimestamp),
        ),
      )
      .catch((err) => console.error("[marcacion] Error refrescando tablero de relevo:", err));

    // Send comprobante email (fire-and-forget)
    // Res. N°38: preferir email personal del guardia; fallback al email corporativo
    const guardiaEmail = guardia.personalEmail ?? guardia.persona.personalEmail ?? guardia.persona.email ?? undefined;
    if (marcacionConfig.emailComprobanteDigitalEnabled && guardia.persona.firstName) {
      if (!guardiaEmail) {
        console.warn(`[marcacion] Guardia ${formatPersonName(guardia.persona.firstName, guardia.persona.lastName)} sin email — comprobante no enviado`);
      } else {
        sendMarcacionComprobante({
          guardiaName: formatPersonName(guardia.persona.firstName, guardia.persona.lastName),
          guardiaEmail,
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
    }

    // Notificar supervisor si está fuera de rango (fire-and-forget)
    if (gpsStatus === "fuera_rango") {
      const deviceDisplay = devicePairingId
        ? await prisma.devicePairing.findUnique({
            where: { id: devicePairingId },
            select: { name: true, deviceModel: true },
          }).then((d) =>
            d?.name
              ? `Equipo sincronizado: ${d.name}`
              : d?.deviceModel
                ? `Dispositivo del usuario: ${d.deviceModel}`
                : "Dispositivo del portal"
          )
        : "Navegador web";

      import("@/lib/marcacion-email").then(({ sendNotificacionFueraDeRango }) =>
        sendNotificacionFueraDeRango({
          tenantId: installation.tenantId,
          installationId: installation.id,
          installationName: installation.name,
          installationLat: installation.lat,
          installationLng: installation.lng,
          guardiaName: formatPersonName(guardia.persona.firstName, guardia.persona.lastName),
          guardiaRut: guardia.persona.rut ?? "",
          tipo,
          timestamp: effectiveTimestamp,
          geoDistanciaM,
          geoRadiusM: effectiveGeoRadiusM,
          lat: lat ?? null,
          lng: lng ?? null,
          deviceDisplay,
        }).catch((err) => console.error("[marcacion] Error notificando supervisor fuera de rango:", err))
      );

      // Alerta al canal Slack de la instalación (foto embebida), en paralelo al correo.
      import("@/lib/marcacion/notify-fuera-rango").then(({ notifyMarcacionFueraRango }) =>
        notifyMarcacionFueraRango({
          tenantId: installation.tenantId,
          installationId: installation.id,
          installationName: installation.name,
          guardiaName: formatPersonName(guardia.persona.firstName, guardia.persona.lastName),
          guardiaRut: guardia.persona.rut ?? "",
          tipo,
          timestamp: effectiveTimestamp,
          geoDistanciaM,
          geoRadiusM: effectiveGeoRadiusM,
          lat: lat ?? null,
          lng: lng ?? null,
          fotoEvidenciaUrl,
          deviceDisplay,
        }).catch((err) => console.error("[marcacion] Error alertando fuera de rango a Slack:", err))
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.id,
        tipo: result.tipo,
        timestamp: result.timestamp.toISOString(),
        geoValidada,
        geoDistanciaM,
        gpsStatus,
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
