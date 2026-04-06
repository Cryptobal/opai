import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { getAtsConfig, updateAtsConfig } from "@/lib/ats/config";
import { requireTenantModule } from '@/lib/require-module';

const updateConfigSchema = z.object({
  pesoOS10: z.number().int().min(0).max(100).optional(),
  pesoDistancia: z.number().int().min(0).max(100).optional(),
  pesoDisponibilidad: z.number().int().min(0).max(100).optional(),
  pesoExperiencia: z.number().int().min(0).max(100).optional(),
  pesoRenta: z.number().int().min(0).max(100).optional(),
  pesoEvaluacion: z.number().int().min(0).max(100).optional(),
  radioMaxKm: z.number().int().min(1).max(500).optional(),
  habilitado: z.boolean().optional(),
  mostrarScoreAlGuardia: z.boolean().optional(),
  filtrosObligatorios: z.array(z.string()).optional(),
  notificarBaseInterna: z.boolean().optional(),
  canalesDefault: z.array(z.string()).optional(),
  autoPublicarAlActivar: z.boolean().optional(),
  expiracionDias: z.number().int().min(1).max(365).optional(),
});

export async function GET() {
  try {
    const modCheck = await requireTenantModule('ats');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const config = await getAtsConfig(ctx.tenantId);
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[ATS] Error getting config:", error);
    return NextResponse.json({ success: false, error: "Error al obtener configuración" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('ats');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, updateConfigSchema);
    if (parsed.error) return parsed.error;
    const updates = parsed.data;

    // Validar que los pesos sumen 100
    const currentConfig = await getAtsConfig(ctx.tenantId);
    const merged = { ...currentConfig, ...updates };
    const pesoTotal =
      merged.pesoOS10 +
      merged.pesoDistancia +
      merged.pesoDisponibilidad +
      merged.pesoExperiencia +
      merged.pesoRenta +
      merged.pesoEvaluacion;

    if (pesoTotal !== 100) {
      return NextResponse.json(
        { success: false, error: `Los pesos del match score deben sumar 100 (actual: ${pesoTotal})` },
        { status: 400 },
      );
    }

    const config = await updateAtsConfig(ctx.tenantId, updates);
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[ATS] Error updating config:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar configuración" }, { status: 500 });
  }
}
