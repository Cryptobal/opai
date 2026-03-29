import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { ensureOpsAccess, createOpsAuditLog } from "@/lib/ops";
import { canView, hasCapability } from "@/lib/permissions";
import { validarTransicion } from "@/lib/alertas-cobertura/state-machine";
import {
  cancelarAlertaSchema,
  confirmarAlertaSchema,
  reAlertarSchema,
} from "@/lib/validations/alertas-cobertura";
import type { OpsAlertaCoberturaEstado } from "@prisma/client";

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
      select: { id: true, estado: true, reAlertaCount: true },
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

      const updated = await prisma.opsAlertaCobertura.update({
        where: { id: alertaId },
        data: {
          estado: "ACTIVA",
          oleadaActual: 0,
          oleadasConfig: [],
          aceptadaPorGuardiaId: null,
          aceptadaAt: null,
          esInternoAceptacion: null,
          reAlertaCount: alerta.reAlertaCount + 1,
          reAlertaMotivo: parsed.data.motivo ?? null,
          proximaOleadaAt: new Date(),
        },
      });

      await createOpsAuditLog(ctx, "alerta_cobertura.re_alerted", "alerta_cobertura", alertaId, {
        reAlertaCount: alerta.reAlertaCount + 1,
        motivo: parsed.data.motivo,
        estadoAnterior: alerta.estado,
      });

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

      const updated = await prisma.opsAlertaCobertura.update({
        where: { id: alertaId },
        data: {
          estado: "CONFIRMADA",
          confirmadaAt: new Date(),
          confirmadaPorId: ctx.userId,
          asignacionPauta: parsed.data.asignacionPauta,
        },
      });

      await createOpsAuditLog(ctx, "alerta_cobertura.confirmed", "alerta_cobertura", alertaId, {
        asignacionPauta: parsed.data.asignacionPauta,
        estadoAnterior: alerta.estado,
      });

      return NextResponse.json({ success: true, data: updated });
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
