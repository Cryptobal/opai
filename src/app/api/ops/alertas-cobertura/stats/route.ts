import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveApiPerms } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { canView } from "@/lib/permissions";
import { requireTenantModule } from '@/lib/require-module';

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

    const { searchParams } = request.nextUrl;
    const fechaDesde = searchParams.get("fechaDesde");
    const fechaHasta = searchParams.get("fechaHasta");
    const installationId = searchParams.get("installationId");

    // Build date filter
    const dateFilter: Record<string, unknown> = {};
    if (fechaDesde) dateFilter.gte = new Date(fechaDesde);
    if (fechaHasta) dateFilter.lte = new Date(fechaHasta);

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter;
    if (installationId) where.installationId = installationId;

    // All alerts matching filters
    const alertas: Array<{
      id: string;
      estado: string;
      modalidad: string;
      urgencia: string | null;
      montoOfrecido: number;
      installationId: string;
      aceptadaAt: Date | null;
      createdAt: Date;
      reAlertaCount: number;
      oleadaActual: number;
      installation: { name: string };
    }> = await prisma.opsAlertaCobertura.findMany({
      where: where as any,
      select: {
        id: true,
        estado: true,
        modalidad: true,
        urgencia: true,
        montoOfrecido: true,
        installationId: true,
        aceptadaAt: true,
        createdAt: true,
        reAlertaCount: true,
        oleadaActual: true,
        installation: { select: { name: true } },
      },
    });

    const total = alertas.length;
    if (total === 0) {
      return NextResponse.json({
        success: true,
        stats: emptyStats(),
      });
    }

    // Counts by state
    const countByEstado = (estado: string) => alertas.filter((a) => a.estado === estado).length;
    const alertasActivas = countByEstado("ACTIVA");
    const alertasAceptadas = countByEstado("ACEPTADA") + countByEstado("CONFIRMADA") + countByEstado("ASIGNADA_PAUTA");
    const alertasConfirmadas = countByEstado("CONFIRMADA") + countByEstado("ASIGNADA_PAUTA");
    const alertasCanceladas = countByEstado("CANCELADA");
    const alertasExpiradas = countByEstado("EXPIRADA");

    // Acceptance rate
    const conAceptacion = alertas.filter((a) => a.aceptadaAt != null).length;
    const tasaAceptacion = total > 0 ? Math.round((conAceptacion / total) * 100) : 0;

    // Average acceptance time (minutes)
    const tiemposAceptacion = alertas
      .filter((a) => a.aceptadaAt != null)
      .map((a) => (a.aceptadaAt!.getTime() - a.createdAt.getTime()) / 60000);
    const tiempoPromedioAceptacionMin =
      tiemposAceptacion.length > 0
        ? Math.round(tiemposAceptacion.reduce((s, t) => s + t, 0) / tiemposAceptacion.length)
        : 0;

    // Average wave at acceptance
    const oleadasAceptacion = alertas
      .filter((a) => a.aceptadaAt != null)
      .map((a) => a.oleadaActual);
    const oleadaPromedioAceptacion =
      oleadasAceptacion.length > 0
        ? Math.round((oleadasAceptacion.reduce((s, o) => s + o, 0) / oleadasAceptacion.length) * 10) / 10
        : 0;

    // Costs
    const montoTotal = alertas.reduce((s, a) => s + a.montoOfrecido, 0);
    const montoPromedio = total > 0 ? Math.round(montoTotal / total) : 0;

    // Distribution by modality
    const porModalidad = {
      GGSS: alertas.filter((a) => a.modalidad === "GGSS").length,
      CCTV: alertas.filter((a) => a.modalidad === "CCTV").length,
      TACTICO: alertas.filter((a) => a.modalidad === "TACTICO").length,
    };

    // Distribution by urgency
    const porUrgencia = {
      URGENTE: alertas.filter((a) => a.urgencia === "URGENTE").length,
      HOY: alertas.filter((a) => a.urgencia === "HOY").length,
      PROGRAMADA: alertas.filter((a) => a.urgencia === "PROGRAMADA").length,
      null: alertas.filter((a) => a.urgencia == null).length,
    };

    // Top installations
    const instMap = new Map<string, { name: string; count: number }>();
    for (const a of alertas) {
      const existing = instMap.get(a.installationId);
      if (existing) {
        existing.count++;
      } else {
        instMap.set(a.installationId, { name: a.installation.name, count: 1 });
      }
    }
    const porInstalacion = Array.from(instMap.entries())
      .map(([installationId, { name, count }]) => ({ installationId, name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Re-alerts
    const reAlertaTotal = alertas.reduce((s, a) => s + a.reAlertaCount, 0);
    const promedioReAlertas = total > 0 ? Math.round((reAlertaTotal / total) * 100) / 100 : 0;

    return NextResponse.json({
      success: true,
      stats: {
        totalAlertas: total,
        alertasActivas,
        alertasAceptadas,
        alertasConfirmadas,
        alertasCanceladas,
        alertasExpiradas,
        tasaAceptacion,
        tiempoPromedioAceptacionMin,
        oleadaPromedioAceptacion,
        montoTotalOfrecido: montoTotal,
        montoPromedio,
        porModalidad,
        porUrgencia,
        porInstalacion,
        reAlertaCount: reAlertaTotal,
        promedioReAlertas,
      },
    });
  } catch (error) {
    console.error("[AlertasCobertura] Error al obtener stats:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener estadísticas" },
      { status: 500 },
    );
  }
}

function emptyStats() {
  return {
    totalAlertas: 0,
    alertasActivas: 0,
    alertasAceptadas: 0,
    alertasConfirmadas: 0,
    alertasCanceladas: 0,
    alertasExpiradas: 0,
    tasaAceptacion: 0,
    tiempoPromedioAceptacionMin: 0,
    oleadaPromedioAceptacion: 0,
    montoTotalOfrecido: 0,
    montoPromedio: 0,
    porModalidad: { GGSS: 0, CCTV: 0, TACTICO: 0 },
    porUrgencia: { URGENTE: 0, HOY: 0, PROGRAMADA: 0, null: 0 },
    porInstalacion: [],
    reAlertaCount: 0,
    promedioReAlertas: 0,
  };
}
