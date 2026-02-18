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
import { normalizeRut, isValidChileanRut } from "@/lib/personas";
import { computeMarcacionHash, haversineDistance } from "@/lib/marcacion";
import { sendMarcacionComprobante } from "@/lib/marcacion-email";
import * as bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(1),
  rut: z.string().min(1),
  pin: z.string().min(4).max(6),
  tipo: z.enum(["entrada", "salida"]),
  lat: z.number({ message: "Geolocalización requerida" }),
  lng: z.number({ message: "Geolocalización requerida" }),
  fotoBase64: z.string().optional(), // Foto de evidencia en base64 (captura cámara frontal)
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

    const { code, rut, pin, tipo, lat, lng, fotoBase64 } = parsed.data;

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
      where: { marcacionCode: code, isActive: true },
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
        { success: false, error: "Código de instalación no válido" },
        { status: 404 }
      );
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
        guardia: {
          select: {
            id: true,
            lifecycleStatus: true,
            isBlacklisted: true,
            marcacionPin: true,
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

    // ── GEOLOCALIZACIÓN OBLIGATORIA Y BLOQUEANTE ──
    // La marcación REQUIERE ubicación GPS válida dentro del radio de la instalación.
    // Si la instalación no tiene coordenadas configuradas, se permite sin validación geo.

    let geoValidada = false;
    let geoDistanciaM: number | null = null;

    if (installation.lat != null && installation.lng != null) {
      // La instalación tiene coordenadas → validación GPS obligatoria
      geoDistanciaM = Math.round(
        haversineDistance(lat, lng, installation.lat, installation.lng)
      );
      geoValidada = geoDistanciaM <= installation.geoRadiusM;

      if (!geoValidada) {
        return NextResponse.json(
          {
            success: false,
            error: `Ubicación fuera de rango. Estás a ${geoDistanciaM}m de la instalación (máximo permitido: ${installation.geoRadiusM}m). Debes estar físicamente en la instalación para marcar.`,
            geoDistanciaM,
            geoRadiusM: installation.geoRadiusM,
          },
          { status: 403 }
        );
      }
    } else {
      // Instalación sin coordenadas → solo registrar la ubicación del guardia
      geoValidada = false;
    }

    // Sello de tiempo del servidor (no del cliente)
    const serverTimestamp = new Date();

    // Hash de integridad SHA-256 (Resolución Exenta N°38)
    const hashIntegridad = computeMarcacionHash({
      guardiaId: guardia.id,
      installationId: installation.id,
      tipo,
      timestamp: serverTimestamp.toISOString(),
      lat,
      lng,
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
          lat,
          lng,
          geoValidada,
          geoDistanciaM,
          metodoId: "rut_pin",
          fotoEvidenciaUrl,
          ipAddress,
          userAgent,
          hashIntegridad,
          atrasoMinutos,
        },
      });

      // 2. Actualizar OpsAsistenciaDiaria si existe registro para hoy
      const todayDate = new Date(serverTimestamp);
      todayDate.setHours(0, 0, 0, 0);

      if (asignacion) {
        const asistencia = await tx.opsAsistenciaDiaria.findFirst({
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
        });

        if (asistencia) {
          const updateData: Record<string, unknown> = {};
          if (tipo === "entrada") {
            updateData.checkInAt = serverTimestamp;
            if (asistencia.attendanceStatus === "pendiente") {
              updateData.attendanceStatus = "asistio";
              updateData.actualGuardiaId = guardia.id;
            }
          } else {
            updateData.checkOutAt = serverTimestamp;
          }

          await tx.opsAsistenciaDiaria.update({
            where: { id: asistencia.id },
            data: updateData,
          });
        }
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
    if (comprobanteEmailEnabled && persona.guardia && persona.firstName) {
      sendMarcacionComprobante({
        guardiaName: `${persona.firstName} ${persona.lastName}`,
        guardiaEmail: persona.email ?? undefined,
        guardiaRut: normalizedRut,
        installationName: installation.name,
        tipo,
        timestamp: serverTimestamp,
        geoValidada,
        geoDistanciaM,
        hashIntegridad,
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
        guardiaName: `${persona.firstName} ${persona.lastName}`,
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
