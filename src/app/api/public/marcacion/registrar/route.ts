/**
 * POST /api/public/marcacion/registrar
 * Registra una marcación de entrada o salida.
 * Ruta pública (sin auth de sesión).
 *
 * Requisitos Resolución Exenta N°38:
 * - Hash SHA-256 de integridad por marcación
 * - Sello de tiempo del servidor
 * - Geolocalización con validación de radio
 * - Transmisión en línea a BD central
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatPersonName, normalizeRut, isValidChileanRut } from "@/lib/personas";
import { computeMarcacionHash, haversineDistance } from "@/lib/marcacion";
import { sendMarcacionComprobante } from "@/lib/marcacion-email";
import { computeAttendanceMetrics } from "@/lib/ops-attendance";
import * as bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(1),
  rut: z.string().min(1),
  pin: z.string().min(4).max(6),
  tipo: z.enum(["entrada", "salida"]),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  gpsAccuracy: z.number().nullable().optional(),
  fotoBase64: z.string().optional(),
  // Solo para marcaciones manuales desde back office (bypass GPS)
  manualFromBackOffice: z.boolean().optional(),
  // Dispositivo del portal (DevicePairing) — para identificar equipo usado
  deviceToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { code, rut, pin, tipo, lat, lng, gpsAccuracy, fotoBase64, manualFromBackOffice, deviceToken } = parsed.data;

    // GPS obligatorio — sin excepción para marcaciones desde portal (manual/import desde back office sí puede omitir)
    if (!manualFromBackOffice && (lat == null || lng == null)) {
      return NextResponse.json(
        { success: false, error: "Ubicación GPS requerida" },
        { status: 400 }
      );
    }

    // Validar RUT
    const normalizedRut = normalizeRut(rut);
    if (!isValidChileanRut(normalizedRut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }

    // Buscar instalación
    const installation = await prisma.crmInstallation.findFirst({
      where: { marcacionCode: code, status: "active" },
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
        { success: false, error: "Código de instalación no válido" },
        { status: 404 }
      );
    }

    // Resolver DevicePairing si viene deviceToken (portal marcación) — debe pertenecer a esta instalación
    let devicePairingId: string | null = null;
    if (deviceToken) {
      const device = await prisma.devicePairing.findFirst({
        where: { deviceToken, status: "ACTIVE", installationId: installation.id },
        select: { id: true },
      });
      if (device) devicePairingId = device.id;
    }

    // Buscar guardia
    const persona = await prisma.opsPersona.findFirst({
      where: {
        rut: normalizedRut,
        tenantId: installation.tenantId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        personalEmail: true,
        guardia: {
          select: {
            id: true,
            lifecycleStatus: true,
            isBlacklisted: true,
            marcacionPin: true,
            dtResolucionJornada: true,
            personalEmail: true,
          },
        },
      },
    });

    if (!persona || !persona.guardia) {
      return NextResponse.json(
        { success: false, error: "RUT o PIN incorrecto" },
        { status: 401 }
      );
    }

    const guardia = persona.guardia;

    // Verificaciones de estado
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

    if (!guardia.marcacionPin) {
      return NextResponse.json(
        { success: false, error: "PIN no configurado" },
        { status: 403 }
      );
    }

    const pinValid = await bcrypt.compare(pin, guardia.marcacionPin);
    if (!pinValid) {
      return NextResponse.json(
        { success: false, error: "RUT o PIN incorrecto" },
        { status: 401 }
      );
    }

    // Verificar que no haya marcación duplicada (no puede marcar dos entradas seguidas)
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

    // ── GEOLOCALIZACIÓN COMO EVIDENCIA (Res. Exenta N°38 Art. 19) ──
    // El GPS es EVIDENCIA, nunca restricción. No se bloquea la marcación por ubicación.
    // Se registra gpsStatus para informar al admin: dentro_rango | fuera_rango | sin_gps

    let geoValidada = false;
    let geoDistanciaM: number | null = null;
    let gpsStatus: "dentro_rango" | "fuera_rango" | "sin_gps" = "sin_gps";

    if (lat != null && lng != null && installation.lat != null && installation.lng != null) {
      geoDistanciaM = Math.round(
        haversineDistance(lat, lng, installation.lat, installation.lng)
      );
      geoValidada = geoDistanciaM <= installation.geoRadiusM;
      gpsStatus = geoValidada ? "dentro_rango" : "fuera_rango";
    } else if (lat != null && lng != null) {
      // Guardia envía GPS pero instalación sin coordenadas configuradas
      gpsStatus = "sin_gps";
    }

    // Sello de tiempo del servidor (no del cliente)
    const serverTimestamp = new Date();

    // Hash de integridad SHA-256 (Resolución Exenta N°38)
    const hashIntegridad = computeMarcacionHash({
      guardiaId: guardia.id,
      installationId: installation.id,
      tipo,
      timestamp: serverTimestamp.toISOString(),
      lat: lat ?? null,
      lng: lng ?? null,
      metodoId: "rut_pin",
      tenantId: installation.tenantId,
    });

    // Foto de evidencia: guardar base64 como data URL (en producción se sube a R2/S3)
    // La foto NO es biométrica — es evidencia visual para supervisión.
    let fotoEvidenciaUrl: string | null = null;
    if (fotoBase64) {
      // Por ahora almacenamos la referencia. En un PR futuro se sube a R2.
      // La foto base64 completa no se guarda en la BD (muy pesada).
      // Se marca que fue capturada.
      fotoEvidenciaUrl = `evidence:${serverTimestamp.toISOString()}`;
    }

    // Buscar asignación activa del guardia en esta instalación para obtener puesto/slot
    const asignacion = await prisma.opsAsignacionGuardia.findFirst({
      where: {
        guardiaId: guardia.id,
        installationId: installation.id,
        isActive: true,
      },
      include: {
        puesto: { select: { shiftStart: true } },
      },
    });

    // Calcular atraso (minutos) cuando es entrada y hay hora de inicio de turno
    let atrasoMinutos: number | null = null;
    if (tipo === "entrada" && asignacion?.puesto?.shiftStart) {
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

    // Headers de la request
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    // Obtener datos del empleador desde configuración del tenant
    const { getTenantCompanyConfig } = await import("@/lib/tenant-config");
    const tenantCfg = await getTenantCompanyConfig(installation.tenantId);

    // Crear la marcación y actualizar asistencia diaria en una transacción
    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear OpsMarcacion
      const marcacion = await tx.opsMarcacion.create({
        data: {
          tenantId: installation.tenantId,
          guardiaId: guardia.id,
          installationId: installation.id,
          puestoId: asignacion?.puestoId ?? null,
          slotNumber: asignacion?.slotNumber ?? null,
          tipo,
          timestamp: serverTimestamp,
          lat: lat ?? null,
          lng: lng ?? null,
          geoValidada,
          geoDistanciaM,
          metodoId: "rut_pin",
          fotoEvidenciaUrl,
          ipAddress,
          userAgent,
          hashIntegridad,
          atrasoMinutos,
          // Resolución Exenta N°38 — Datos obligatorios
          employerRut: tenantCfg.rut,
          employerName: tenantCfg.razonSocial,
          establishmentAddress: installation.address,
          dtResolutionNumber: guardia.dtResolucionJornada,
          gpsStatus,
          distanciaMetros: geoDistanciaM,
          gpsAccuracy: gpsAccuracy ?? null,
          devicePairingId,
        },
      });

      // 2. Actualizar OpsAsistenciaDiaria si existe registro para hoy
      const todayDate = new Date(serverTimestamp);
      todayDate.setHours(0, 0, 0, 0);

      // Priority 1: check if guard is a replacement today (turno extra)
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

      // Priority 2: regular assignment slot
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
              include: {
                puesto: { select: { shiftStart: true, shiftEnd: true } },
              },
            })
          : null);

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

    // Verificar si el email de comprobante digital está habilitado
    let comprobanteEmailEnabled = true;
    const marcacionConfigSetting = await prisma.setting.findFirst({
      where: { key: `marcacion_config:${installation.tenantId}` },
    });
    if (marcacionConfigSetting?.value) {
      try {
        const cfg = JSON.parse(marcacionConfigSetting.value);
        comprobanteEmailEnabled = cfg.emailComprobanteDigitalEnabled !== false;
      } catch { /* use default */ }
    }

    // Enviar comprobante por email (fire-and-forget, no bloquea la respuesta)
    // Res. N°38: preferir email personal del guardia; fallback al email corporativo
    const guardiaEmail = persona.guardia?.personalEmail ?? persona.personalEmail ?? persona.email ?? undefined;
    if (comprobanteEmailEnabled && persona.guardia && persona.firstName) {
      if (!guardiaEmail) {
        console.warn(`[marcacion] Guardia ${formatPersonName(persona.firstName, persona.lastName)} sin email personal — comprobante no enviado`);
      } else {
        sendMarcacionComprobante({
          guardiaName: formatPersonName(persona.firstName, persona.lastName),
          guardiaEmail,
          guardiaRut: normalizedRut,
          installationName: installation.name,
          tipo,
          timestamp: serverTimestamp,
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
          guardiaName: formatPersonName(persona.firstName, persona.lastName),
          guardiaRut: normalizedRut,
          tipo,
          timestamp: serverTimestamp,
          geoDistanciaM,
          geoRadiusM: installation.geoRadiusM,
          lat: lat ?? null,
          lng: lng ?? null,
          deviceDisplay,
        }).catch((err) => console.error("[marcacion] Error notificando supervisor fuera de rango:", err))
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
        guardiaName: formatPersonName(persona.firstName, persona.lastName),
        installationName: installation.name,
        hashIntegridad: result.hashIntegridad,
      },
    });
  } catch (error) {
    console.error("[marcacion/registrar] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
