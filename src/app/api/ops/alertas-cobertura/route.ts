import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { ensureOpsAccess, createOpsAuditLog } from "@/lib/ops";
import { canView, hasCapability } from "@/lib/permissions";
import { crearAlertaSchema } from "@/lib/validations/alertas-cobertura";
import { getAlertaCoberturaConfig } from "@/lib/alertas-cobertura/config";
import { generarOleadas } from "@/lib/alertas-cobertura/oleadas.service";
import { notificarOleada, emitirEventoPusher } from "@/lib/alertas-cobertura/notificacion.service";
import { addHours, addMinutes } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { requireTenantModule } from '@/lib/require-module';

const TZ = "America/Santiago";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('alertas_cobertura');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "alertas_cobertura")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const estado = params.get("estado");
    const installationId = params.get("installationId");
    const creadaPorId = params.get("creadaPorId");
    const fechaDesde = params.get("fechaDesde");
    const fechaHasta = params.get("fechaHasta");
    const page = Math.max(1, parseInt(params.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };

    if (estado) {
      const estados = estado.split(",").map((e) => e.trim());
      where.estado = estados.length === 1 ? estados[0] : { in: estados };
    }
    if (installationId) where.installationId = installationId;
    if (creadaPorId) where.creadaPorId = creadaPorId;
    if (fechaDesde || fechaHasta) {
      const dateFilter: Record<string, Date> = {};
      if (fechaDesde) dateFilter.gte = new Date(fechaDesde);
      if (fechaHasta) dateFilter.lte = new Date(fechaHasta);
      where.createdAt = dateFilter;
    }

    const [alertas, total] = await Promise.all([
      prisma.opsAlertaCobertura.findMany({
        where,
        include: {
          installation: { select: { id: true, name: true, address: true, commune: true, city: true } },
          creadaPor: { select: { id: true, name: true, email: true } },
          aceptadaPorGuardia: {
            select: {
              id: true,
              persona: { select: { firstName: true, lastName: true, rut: true } },
            },
          },
          _count: { select: { aceptaciones: true, notificaciones: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.opsAlertaCobertura.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: alertas,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[AlertasCobertura] Error al listar alertas:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener alertas de cobertura" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('alertas_cobertura');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "alerta_cobertura_crear")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para crear alertas de cobertura" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, crearAlertaSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // Resolver modo: instalación o libre
    const esModoLibre = !body.installationId;

    let installation: Awaited<
      ReturnType<typeof prisma.crmInstallation.findFirst<{
        select: { id: true; name: true; teMontoClp: true };
      }>>
    > = null;
    let puestoTeMontoClp: number | null = null;

    if (!esModoLibre) {
      // MODO INSTALACIÓN
      installation = await prisma.crmInstallation.findFirst({
        where: { id: body.installationId!, tenantId: ctx.tenantId },
        select: { id: true, name: true, teMontoClp: true },
      });
      if (!installation) {
        return NextResponse.json(
          { success: false, error: "Instalación no encontrada" },
          { status: 404 },
        );
      }

      if (body.puestoId) {
        const puesto = await prisma.opsPuestoOperativo.findFirst({
          where: { id: body.puestoId, installationId: body.installationId!, tenantId: ctx.tenantId },
          select: { id: true, teMontoClp: true },
        });
        if (!puesto) {
          return NextResponse.json(
            { success: false, error: "Puesto no encontrado en esta instalación" },
            { status: 404 },
          );
        }
        puestoTeMontoClp = puesto.teMontoClp ? Number(puesto.teMontoClp) : null;
      }
    } else {
      // MODO LIBRE — validar que tenemos address + lat/lng (el Zod ya lo exige pero doble check)
      if (!body.libreAddress || body.libreLat == null || body.libreLng == null) {
        return NextResponse.json(
          {
            success: false,
            error: "Debes ingresar una dirección libre con coordenadas",
          },
          { status: 400 },
        );
      }
    }

    // Resolver monto
    const config = await getAlertaCoberturaConfig(ctx.tenantId);
    let montoOfrecido = body.montoOfrecido;
    if (montoOfrecido === 0 && !esModoLibre) {
      montoOfrecido =
        puestoTeMontoClp ??
        (installation?.teMontoClp ? Number(installation.teMontoClp) : null) ??
        config.montoDefaultClp;
    }
    // En modo libre el Zod ya garantiza montoOfrecido > 0

    const now = toZonedTime(new Date(), TZ);

    // Calcular TTL y próxima oleada
    const expiraAt = addHours(now, config.alertaTtlHoras);
    const primerOleadaEspera = config.incluirTurnoSaliente
      ? config.oleada0EsperaMin
      : config.oleada1EsperaMin;
    const proximaOleadaAt = addMinutes(now, primerOleadaEspera);

    const alerta = await prisma.opsAlertaCobertura.create({
      data: {
        tenantId: ctx.tenantId,
        creadaPorId: ctx.userId,
        installationId: esModoLibre ? null : body.installationId!,
        puestoId: esModoLibre ? null : (body.puestoId ?? null),
        libreAddress: esModoLibre ? body.libreAddress! : null,
        libreLat: esModoLibre ? body.libreLat! : null,
        libreLng: esModoLibre ? body.libreLng! : null,
        libreComuna: esModoLibre ? (body.libreComuna ?? null) : null,
        libreCiudad: esModoLibre ? (body.libreCiudad ?? null) : null,
        radioKm: body.radioKm ?? 30,
        genero: body.genero ?? null,
        modalidad: body.modalidad,
        requiereOS10: body.requiereOS10 ?? true,
        soloDealer: body.soloDealer ?? false,
        soloConMovilizacion: body.soloConMovilizacion ?? false,
        fechaInicio: new Date(body.fechaInicio),
        fechaFin: new Date(body.fechaFin),
        montoOfrecido,
        funciones: body.funciones,
        urgencia: body.urgencia ?? null,
        notasInternas: body.notasInternas ?? null,
        estado: "ACTIVA",
        oleadaActual: 0,
        oleadasConfig: [],
        proximaOleadaAt,
        expiraAt,
      },
      include: {
        installation: { select: { id: true, name: true } },
        creadaPor: { select: { id: true, name: true } },
      },
    });

    await createOpsAuditLog(ctx, "alerta_cobertura.created", "alerta_cobertura", alerta.id, {
      installationId: body.installationId ?? null,
      libreAddress: body.libreAddress ?? null,
      modalidad: body.modalidad,
      urgencia: body.urgencia,
      montoOfrecido,
    });

    // Resolver coordenadas y nombre/dirección a usar para generar oleadas + notificar
    let lat: number | null = null;
    let lng: number | null = null;
    let direccionParaNotificar = "";
    let nombreParaNotificar = "";

    if (esModoLibre) {
      lat = body.libreLat!;
      lng = body.libreLng!;
      direccionParaNotificar = body.libreAddress!;
      nombreParaNotificar = body.libreComuna
        ? `Cobertura — ${body.libreComuna}`
        : "Cobertura (dirección libre)";
    } else {
      const instGeo = await prisma.crmInstallation.findUnique({
        where: { id: body.installationId! },
        select: { lat: true, lng: true, address: true },
      });
      if (instGeo?.lat != null && instGeo?.lng != null) {
        lat = Number(instGeo.lat);
        lng = Number(instGeo.lng);
      }
      direccionParaNotificar = instGeo?.address ?? "";
      nombreParaNotificar = installation?.name ?? "";
    }

    let oleadasGeneradas = 0;
    let totalGuardias = 0;
    let advertencia: string | null = null;

    if (lat != null && lng != null) {
      try {
        const resultado = await generarOleadas({
          tenantId: ctx.tenantId,
          installationId: esModoLibre ? null : body.installationId!,
          instalacionLat: lat,
          instalacionLng: lng,
          fechaInicio: new Date(body.fechaInicio),
          fechaFin: new Date(body.fechaFin),
          radioKm: body.radioKm ?? 30,
          genero: body.genero ?? null,
          modalidad: body.modalidad,
          requiereOS10: body.requiereOS10 ?? true,
          soloDealer: body.soloDealer ?? false,
          soloConMovilizacion: body.soloConMovilizacion ?? false,
        });

        const primeraOleada = resultado.oleadas[0];
        const nuevaProximaOleadaAt = primeraOleada
          ? addMinutes(now, primeraOleada.esperaMin)
          : expiraAt;

        await prisma.opsAlertaCobertura.update({
          where: { id: alerta.id },
          data: {
            oleadasConfig: resultado.oleadas as unknown as Prisma.InputJsonValue,
            proximaOleadaAt: nuevaProximaOleadaAt,
          },
        });

        // Log primera oleada
        if (primeraOleada) {
          await prisma.opsAlertaOleadaLog.create({
            data: {
              alertaId: alerta.id,
              oleadaNumero: primeraOleada.numero,
              tipo: primeraOleada.tipo,
              radioMinKm: primeraOleada.radioMinKm,
              radioMaxKm: primeraOleada.radioMaxKm,
              guardiasNotificados: primeraOleada.guardiaCount,
            },
          });
        }

        oleadasGeneradas = resultado.oleadas.length;
        totalGuardias = resultado.totalGuardias;

        // Advertencia si no se encontraron guardias
        if (resultado.totalGuardias === 0) {
          advertencia = `No se encontraron guardias elegibles en un radio de ${body.radioKm ?? 30}km. Verifique que los guardias tengan coordenadas, OS10 vigente y no estén en turno. Guardias sin coordenadas: ${resultado.guardiasSinCoordenadas}.`;
          console.warn(
            `[AlertaCobertura] Alerta ${alerta.id}: 0 guardias encontrados. Sin coordenadas: ${resultado.guardiasSinCoordenadas}`,
          );
        }

        // Sprint 3: Disparar notificaciones a oleada 0 (fire-and-forget)
        if (primeraOleada && primeraOleada.guardiaIds.length > 0) {
          notificarOleada({
            tenantId: ctx.tenantId,
            alertaId: alerta.id,
            oleadaNumero: 0,
            guardiaIds: primeraOleada.guardiaIds,
            esInterno: primeraOleada.tipo !== "EXTERNO",
            instalacionNombre: nombreParaNotificar,
            instalacionDireccion: direccionParaNotificar,
            instalacionId: esModoLibre ? null : body.installationId!,
            fechaInicio: new Date(body.fechaInicio),
            fechaFin: new Date(body.fechaFin),
            montoOfrecido: montoOfrecido,
            funciones: body.funciones,
            urgencia: body.urgencia ?? null,
            tiempoRestanteOleadaMin: primeraOleada.esperaMin,
            modalidad: body.modalidad,
          }).catch((err) => console.error("[AlertaCobertura] Error notificando oleada 0:", err));
        }

        // Pusher: nueva alerta creada
        emitirEventoPusher(ctx.tenantId, "alerta-creada", {
          alertaId: alerta.id,
          installationId: esModoLibre ? null : body.installationId!,
          instalacionNombre: nombreParaNotificar,
          estado: "ACTIVA",
          oleadaActual: 0,
          totalOleadas: resultado.oleadas.length,
          totalGuardias: resultado.totalGuardias,
          urgencia: body.urgencia ?? null,
          montoOfrecido,
        }).catch(() => {});

        console.log(
          `[AlertaCobertura] Alerta ${alerta.id} creada con ${resultado.oleadas.length} oleadas, ${resultado.totalGuardias} guardias totales`,
        );
      } catch (err) {
        console.error("[AlertaCobertura] Error generando oleadas:", err);
        advertencia = "Error generando oleadas de notificación. La alerta se creó pero las notificaciones pueden no enviarse. Use Re-Alertar para reintentar.";
      }
    } else {
      advertencia = "La instalación no tiene coordenadas geográficas. No se pueden generar oleadas de notificación. Actualice la dirección de la instalación.";
      console.warn(
        `[AlertaCobertura] Instalación ${body.installationId} sin coordenadas — oleadas no generadas`,
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: { ...alerta, oleadasGeneradas, totalGuardias },
        ...(advertencia ? { advertencia } : {}),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[AlertasCobertura] Error al crear alerta:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear alerta de cobertura" },
      { status: 500 },
    );
  }
}
