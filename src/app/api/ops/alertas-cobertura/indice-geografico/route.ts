import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveApiPerms } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { canView } from "@/lib/permissions";
import { haversineDistance } from "@/lib/marcacion";
import { requireTenantModule } from '@/lib/require-module';

/**
 * GET — Índice de optimización geográfica por instalación.
 *
 * Para cada instalación activa, calcula un score de proximidad guardia→instalación.
 * Query params: installationId (opcional — si no se pasa, retorna todas).
 */
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

    const installationId = request.nextUrl.searchParams.get("installationId");

    // Obtener instalaciones con coordenadas
    const whereInstallation: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      status: "active",
      lat: { not: null },
      lng: { not: null },
    };
    if (installationId) whereInstallation.id = installationId;

    const installations = await prisma.crmInstallation.findMany({
      where: whereInstallation,
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        commune: true,
        city: true,
      },
    });

    // Obtener asignaciones activas con datos de guardia
    const asignaciones = await prisma.opsAsignacionGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        installationId: installationId ? installationId : { in: installations.map((i: any) => i.id) },
      },
      select: {
        installationId: true,
        guardiaId: true,
        guardia: {
          select: {
            persona: {
              select: { firstName: true, lastName: true, lat: true, lng: true },
            },
          },
        },
      },
    });

    // Agrupar asignaciones por instalación
    const asignacionesPorInst = new Map<string, typeof asignaciones>();
    for (const a of asignaciones) {
      const arr = asignacionesPorInst.get(a.installationId) ?? [];
      arr.push(a);
      asignacionesPorInst.set(a.installationId, arr);
    }

    const resultados = installations.map((inst: any) => {
      const instLat = Number(inst.lat);
      const instLng = Number(inst.lng);
      const guardias = asignacionesPorInst.get(inst.id) ?? [];

      let sinCoordenadas = 0;
      const distancias: number[] = [];
      const guardiasDetalle: Array<{ id: string; nombre: string; distanciaKm: number | null }> = [];

      for (const g of guardias) {
        const gLat = g.guardia?.persona?.lat;
        const gLng = g.guardia?.persona?.lng;
        const nombre = `${g.guardia?.persona?.firstName ?? ""} ${g.guardia?.persona?.lastName ?? ""}`.trim() || "Sin nombre";

        if (gLat == null || gLng == null) {
          sinCoordenadas++;
          guardiasDetalle.push({ id: g.guardiaId, nombre, distanciaKm: null });
          continue;
        }

        const distM = haversineDistance(instLat, instLng, Number(gLat), Number(gLng));
        const distKm = Math.round((distM / 1000) * 10) / 10;
        distancias.push(distKm);
        guardiasDetalle.push({ id: g.guardiaId, nombre, distanciaKm: distKm });
      }

      // Ordenar por distancia (null al final)
      guardiasDetalle.sort((a, b) => {
        if (a.distanciaKm == null) return 1;
        if (b.distanciaKm == null) return -1;
        return a.distanciaKm - b.distanciaKm;
      });

      const cercanos = distancias.filter((d) => d <= 5).length;
      const medianos = distancias.filter((d) => d > 5 && d <= 15).length;
      const lejanos = distancias.filter((d) => d > 15 && d <= 30).length;
      const muyLejanos = distancias.filter((d) => d > 30).length;

      const distanciaPromedioKm =
        distancias.length > 0
          ? Math.round((distancias.reduce((s, d) => s + d, 0) / distancias.length) * 10) / 10
          : 0;
      const distanciaMaxKm =
        distancias.length > 0 ? Math.round(Math.max(...distancias) * 10) / 10 : 0;

      // Score: 100 si todos < 5km, penalizar proporcional por distancia
      let score = 100;
      if (distancias.length > 0) {
        const totalEvaluados = distancias.length;
        score = Math.round(
          (cercanos * 100 + medianos * 60 + lejanos * 30 + muyLejanos * 5) / totalEvaluados,
        );
      }

      // Generar alertas textuales
      const alertas: string[] = [];
      if (sinCoordenadas > 0) {
        alertas.push(`${sinCoordenadas} guardia(s) sin coordenadas — no evaluable(s)`);
      }
      if (distanciaMaxKm > 25) {
        alertas.push(
          `⚠️ Guardia más lejano a ${distanciaMaxKm}km — riesgo de atrasos`,
        );
      }
      if (guardias.length === 0) {
        alertas.push("Sin guardias asignados");
      }

      return {
        installationId: inst.id,
        name: inst.name,
        commune: inst.commune,
        city: inst.city,
        totalGuardias: guardias.length,
        sinCoordenadas,
        distanciaPromedioKm,
        distanciaMaxKm,
        anillos: {
          cercanos_0_5km: cercanos,
          medianos_5_15km: medianos,
          lejanos_15_30km: lejanos,
          muyLejanos_30plus: muyLejanos,
        },
        scoreOptimizacion: Math.max(0, Math.min(100, score)),
        alertas: alertas.length > 0 ? alertas.join(" | ") : null,
        guardias: guardiasDetalle,
      };
    });

    // Ordenar por score ASC (peores primero)
    resultados.sort((a: any, b: any) => a.scoreOptimizacion - b.scoreOptimizacion);

    return NextResponse.json({
      success: true,
      data: resultados,
      resumen: {
        totalInstalaciones: resultados.length,
        scorePromedio:
          resultados.length > 0
            ? Math.round(
                resultados.reduce((s: number, r: any) => s + r.scoreOptimizacion, 0) / resultados.length,
              )
            : 0,
        instalacionesCriticas: resultados.filter((r: any) => r.scoreOptimizacion < 40).length,
      },
    });
  } catch (error) {
    console.error("[AlertasCobertura] Error en índice geográfico:", error);
    return NextResponse.json(
      { success: false, error: "Error al calcular índice geográfico" },
      { status: 500 },
    );
  }
}
