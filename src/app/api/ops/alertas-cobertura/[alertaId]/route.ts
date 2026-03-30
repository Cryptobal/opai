import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { ensureOpsAccess, createOpsAuditLog } from "@/lib/ops";
import { canView, hasCapability } from "@/lib/permissions";
import { validarTransicion } from "@/lib/alertas-cobertura/state-machine";
import { generarOleadas } from "@/lib/alertas-cobertura/oleadas.service";
import { getAlertaCoberturaConfig } from "@/lib/alertas-cobertura/config";
import {
  cancelarAlertaSchema,
  confirmarAlertaSchema,
  reAlertarSchema,
} from "@/lib/validations/alertas-cobertura";
import { addHours, addMinutes } from "date-fns";
// OpsAlertaCoberturaEstado enum — validated by state-machine.ts
type OpsAlertaCoberturaEstado = "BORRADOR" | "ACTIVA" | "ACEPTADA" | "CONFIRMADA" | "ASIGNADA_PAUTA" | "CANCELADA" | "EXPIRADA";
import {
  autoAsignarEnPauta,
  registrarAsignacionManual,
} from "@/lib/alertas-cobertura/asignacion.service";
import { notificarGuardiaConfirmacion, emitirEventoPusher } from "@/lib/alertas-cobertura/notificacion.service";
import { sendSystemChatMessage } from "@/lib/chat-system-message";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ alertaId: string }> },
) {
  try {
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

    const { alertaId } = await params;

    const alerta = await prisma.opsAlertaCobertura.findFirst({
      where: { id: alertaId, tenantId: ctx.tenantId },
      include: {
        installation: {
          select: { id: true, name: true, address: true, commune: true, city: true, lat: true, lng: true },
        },
        puesto: { select: { id: true, name: true, shiftStart: true, shiftEnd: true } },
        creadaPor: { select: { id: true, name: true, email: true } },
        aceptadaPorGuardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true, rut: true, phone: true } },
          },
        },
        aceptaciones: {
          include: {
            guardia: {
              select: {
                id: true,
                persona: { select: { firstName: true, lastName: true, rut: true } },
              },
            },
          },
          orderBy: { intentoAt: "asc" },
        },
        oleadasLog: { orderBy: { oleadaNumero: "asc" } },
        _count: { select: { notificaciones: true } },
      },
    });

    if (!alerta) {
      return NextResponse.json(
        { success: false, error: "Alerta no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: alerta });
  } catch (error) {
    console.error("[AlertasCobertura] Error al obtener detalle:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener alerta" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ alertaId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "alerta_cobertura_gestionar")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para gestionar alertas" },
        { status: 403 },
      );
    }

    const { alertaId } = await params;
    const action = request.nextUrl.searchParams.get("action");

    if (!action || !["cancelar", "re-alertar", "confirmar"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Acción inválida. Usar: cancelar, re-alertar, confirmar" },
        { status: 400 },
      );
    }

    const alerta = await prisma.opsAlertaCobertura.findFirst({
      where: { id: alertaId, tenantId: ctx.tenantId },
      select: {
        id: true,
        estado: true,
        reAlertaCount: true,
        installationId: true,
        puestoId: true,
        fechaInicio: true,
        fechaFin: true,
        montoOfrecido: true,
        radioKm: true,
        genero: true,
        modalidad: true,
        requiereOS10: true,
        soloDealer: true,
        soloConMovilizacion: true,
        expiraAt: true,
        aceptadaPorGuardiaId: true,
        creadaPorId: true,
        installation: { select: { name: true, lat: true, lng: true } },
      },
    });

    if (!alerta) {
      return NextResponse.json(
        { success: false, error: "Alerta no encontrada" },
        { status: 404 },
      );
    }

    if (action === "cancelar") {
      const parsed = await parseBody(request, cancelarAlertaSchema);
      if (parsed.error) return parsed.error;

      const transicion = validarTransicion(alerta.estado, "CANCELADA" as OpsAlertaCoberturaEstado);
      if (!transicion.valido) {
        return NextResponse.json(
          { success: false, error: transicion.error },
          { status: 400 },
        );
      }

      const updated = await prisma.opsAlertaCobertura.update({
        where: { id: alertaId },
        data: {
          estado: "CANCELADA",
          canceladaAt: new Date(),
          canceladaPorId: ctx.userId,
          cancelMotivo: parsed.data.motivo,
        },
      });

      await createOpsAuditLog(ctx, "alerta_cobertura.cancelled", "alerta_cobertura", alertaId, {
        motivo: parsed.data.motivo,
        estadoAnterior: alerta.estado,
      });

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "re-alertar") {
      const parsed = await parseBody(request, reAlertarSchema);
      if (parsed.error) return parsed.error;

      const transicion = validarTransicion(alerta.estado, "ACTIVA" as OpsAlertaCoberturaEstado);
      if (!transicion.valido) {
        return NextResponse.json(
          { success: false, error: transicion.error },
          { status: 400 },
        );
      }

      // Regenerar oleadas
      let oleadasConfig: unknown[] = [];
      let proximaOleadaAt = new Date();

      const inst = alerta.installation;
      if (inst?.lat != null && inst?.lng != null) {
        try {
          const config = await getAlertaCoberturaConfig(ctx.tenantId);
          const resultado = await generarOleadas({
            tenantId: ctx.tenantId,
            installationId: alerta.installationId,
            instalacionLat: Number(inst.lat),
            instalacionLng: Number(inst.lng),
            fechaInicio: alerta.fechaInicio,
            fechaFin: alerta.fechaFin,
            radioKm: alerta.radioKm,
            genero: alerta.genero,
            modalidad: alerta.modalidad,
            requiereOS10: alerta.requiereOS10,
            soloDealer: alerta.soloDealer,
            soloConMovilizacion: alerta.soloConMovilizacion,
          });
          oleadasConfig = resultado.oleadas;
          const primeraOleada = resultado.oleadas[0];
          proximaOleadaAt = primeraOleada
            ? addMinutes(new Date(), primeraOleada.esperaMin)
            : alerta.expiraAt;

          if (primeraOleada) {
            await prisma.opsAlertaOleadaLog.create({
              data: {
                alertaId,
                oleadaNumero: primeraOleada.numero,
                tipo: primeraOleada.tipo,
                radioMinKm: primeraOleada.radioMinKm,
                radioMaxKm: primeraOleada.radioMaxKm,
                guardiasNotificados: primeraOleada.guardiaCount,
              },
            });
          }

          console.log(
            `[AlertaCobertura] Re-alerta ${alertaId}: ${resultado.oleadas.length} oleadas, ${resultado.totalGuardias} guardias`,
          );
        } catch (err) {
          console.error("[AlertaCobertura] Error regenerando oleadas en re-alerta:", err);
        }
      }

      const updated = await prisma.opsAlertaCobertura.update({
        where: { id: alertaId },
        data: {
          estado: "ACTIVA",
          oleadaActual: 0,
          oleadasConfig: oleadasConfig as unknown as Prisma.InputJsonValue,
          aceptadaPorGuardiaId: null,
          aceptadaAt: null,
          esInternoAceptacion: null,
          reAlertaCount: alerta.reAlertaCount + 1,
          reAlertaMotivo: parsed.data.motivo ?? null,
          proximaOleadaAt,
        },
      });

      await createOpsAuditLog(ctx, "alerta_cobertura.re_alerted", "alerta_cobertura", alertaId, {
        reAlertaCount: alerta.reAlertaCount + 1,
        motivo: parsed.data.motivo,
        estadoAnterior: alerta.estado,
      });

      // Chat de instalación (fire-and-forget)
      (async () => {
        try {
          const installation = await prisma.crmInstallation.findUnique({
            where: { id: alerta.installationId },
            select: { chatEnabled: true, chatChannels: { select: { id: true }, take: 1 } },
          });
          if (installation?.chatEnabled && installation.chatChannels[0]?.id) {
            await sendSystemChatMessage({
              tenantId: ctx.tenantId,
              channelId: installation.chatChannels[0].id,
              content: "🔄 Alerta de cobertura re-activada — el guardia anterior no se presentó. Se están enviando nuevas oleadas.",
              systemEventType: "alerta_cobertura",
              systemEventData: {
                alertaId,
                reAlertaCount: alerta.reAlertaCount + 1,
                link: `/ops/alertas-cobertura/${alertaId}`,
              },
            });
          }
        } catch (e) {
          console.error("[AlertaCobertura] Error enviando chat re-alerta:", e);
        }
      })();

      // Pusher real-time (fire-and-forget)
      emitirEventoPusher(ctx.tenantId, "alerta-re-alertada", {
        alertaId,
        reAlertaCount: alerta.reAlertaCount + 1,
      }).catch(() => {});

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "confirmar") {
      const parsed = await parseBody(request, confirmarAlertaSchema);
      if (parsed.error) return parsed.error;

      const transicion = validarTransicion(alerta.estado, "CONFIRMADA" as OpsAlertaCoberturaEstado);
      if (!transicion.valido) {
        return NextResponse.json(
          { success: false, error: transicion.error },
          { status: 400 },
        );
      }

      if (!alerta.aceptadaPorGuardiaId) {
        return NextResponse.json(
          { success: false, error: "No hay guardia aceptado para confirmar" },
          { status: 400 },
        );
      }

      if (parsed.data.asignacionPauta === "AUTOMATICA") {
        const config = await getAlertaCoberturaConfig(ctx.tenantId);

        if (!config.autoAsignarPauta) {
          return NextResponse.json(
            { success: false, error: "Auto-asignación en pauta está deshabilitada en la configuración" },
            { status: 400 },
          );
        }

        const resultado = await autoAsignarEnPauta({
          tenantId: ctx.tenantId,
          alertaId: alerta.id,
          guardiaId: alerta.aceptadaPorGuardiaId,
          installationId: alerta.installationId,
          puestoId: alerta.puestoId,
          fechaInicio: alerta.fechaInicio,
          fechaFin: alerta.fechaFin,
          montoOfrecido: alerta.montoOfrecido,
          confirmadoPorId: ctx.userId,
        });

        if (!resultado.success) {
          return NextResponse.json(
            { success: false, error: resultado.error || "Error al asignar en pauta" },
            { status: 500 },
          );
        }

        await createOpsAuditLog(ctx, "alerta_cobertura.confirmed_auto", "alerta_cobertura", alertaId, {
          asignacionPauta: "AUTOMATICA",
          turnoExtraId: resultado.turnoExtraId,
          estadoAnterior: alerta.estado,
        });

        // Notificar guardia (fire-and-forget)
        notificarGuardiaConfirmacion({
          tenantId: ctx.tenantId,
          guardiaId: alerta.aceptadaPorGuardiaId,
          alertaId: alerta.id,
          instalacionNombre: alerta.installation.name,
          fechaInicio: alerta.fechaInicio,
          montoOfrecido: alerta.montoOfrecido,
          asignacionTipo: "AUTOMATICA",
        }).catch((err) => console.error("[AlertaCobertura] Error notificando guardia confirmación:", err));

        // Pusher real-time (fire-and-forget)
        emitirEventoPusher(ctx.tenantId, "alerta-asignada", {
          alertaId: alerta.id,
          turnoExtraId: resultado.turnoExtraId,
          asistenciaId: resultado.asistenciaId,
        }).catch(() => {});

        return NextResponse.json({
          success: true,
          message: "Turno extra registrado y asignado en pauta automáticamente",
          turnoExtraId: resultado.turnoExtraId,
        });
      } else {
        // MANUAL
        await registrarAsignacionManual({
          tenantId: ctx.tenantId,
          alertaId: alerta.id,
          confirmadoPorId: ctx.userId,
        });

        await createOpsAuditLog(ctx, "alerta_cobertura.confirmed_manual", "alerta_cobertura", alertaId, {
          asignacionPauta: "MANUAL",
          estadoAnterior: alerta.estado,
        });

        // Notificar guardia (fire-and-forget)
        notificarGuardiaConfirmacion({
          tenantId: ctx.tenantId,
          guardiaId: alerta.aceptadaPorGuardiaId,
          alertaId: alerta.id,
          instalacionNombre: alerta.installation.name,
          fechaInicio: alerta.fechaInicio,
          montoOfrecido: alerta.montoOfrecido,
          asignacionTipo: "MANUAL",
        }).catch((err) => console.error("[AlertaCobertura] Error notificando guardia confirmación:", err));

        return NextResponse.json({
          success: true,
          message: "Alerta confirmada. Asigne manualmente en la pauta.",
        });
      }
    }

    return NextResponse.json({ success: false, error: "Acción no reconocida" }, { status: 400 });
  } catch (error) {
    console.error("[AlertasCobertura] Error al actualizar alerta:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar alerta" },
      { status: 500 },
    );
  }
}
