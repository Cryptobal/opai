import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { hasCapability } from "@/lib/permissions";
import { crearAlertaSchema } from "@/lib/validations/alertas-cobertura";
import { generarOleadas } from "@/lib/alertas-cobertura/oleadas.service";
import { requireTenantModule } from '@/lib/require-module';

/**
 * POST — Preview de oleadas sin crear alerta.
 *
 * El supervisor ve ANTES de crear: cuántos guardias hay por oleada, a quiénes les llegaría.
 * Recibe los mismos parámetros que POST crear alerta, pero NO persiste nada.
 */
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

    // Obtener coordenadas de la instalación
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: body.installationId, tenantId: ctx.tenantId },
      select: { id: true, name: true, lat: true, lng: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 },
      );
    }

    if (installation.lat == null || installation.lng == null) {
      return NextResponse.json(
        {
          success: false,
          error: "La instalación no tiene coordenadas geográficas configuradas",
        },
        { status: 400 },
      );
    }

    const resultado = await generarOleadas({
      tenantId: ctx.tenantId,
      installationId: body.installationId,
      instalacionLat: Number(installation.lat),
      instalacionLng: Number(installation.lng),
      fechaInicio: new Date(body.fechaInicio),
      fechaFin: new Date(body.fechaFin),
      radioKm: body.radioKm ?? 30,
      genero: body.genero ?? null,
      modalidad: body.modalidad,
      requiereOS10: body.requiereOS10 ?? true,
      soloDealer: body.soloDealer ?? false,
      soloConMovilizacion: body.soloConMovilizacion ?? false,
    });

    return NextResponse.json({
      success: true,
      oleadas: resultado.previews.map((o) => ({
        numero: o.numero,
        tipo: o.tipo,
        guardiaCount: o.guardiaCount,
        guardias: o.guardias.slice(0, 20), // Limitar preview a 20 por oleada
        radioKm: o.radioMaxKm > 0 ? `${o.radioMinKm}-${o.radioMaxKm}km` : "En sitio",
        esperaMin: o.esperaMin,
      })),
      totalGuardias: resultado.totalGuardias,
      tiempoEstimadoMin: resultado.tiempoEstimadoMin,
      cobertura: {
        conCoordenadas: resultado.guardiasConCoordenadas,
        sinCoordenadas: resultado.guardiasSinCoordenadas,
      },
    });
  } catch (error) {
    console.error("[AlertasCobertura] Error en preview de oleadas:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar preview de oleadas" },
      { status: 500 },
    );
  }
}
