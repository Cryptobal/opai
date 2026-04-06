import { NextRequest, NextResponse } from "next/server";
import { requireAuth, parseBody, resolveApiPerms } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { canView, hasCapability } from "@/lib/permissions";
import {
  getAlertaCoberturaConfig,
  updateAlertaCoberturaConfig,
} from "@/lib/alertas-cobertura/config";
import { actualizarConfigSchema } from "@/lib/validations/alertas-cobertura";
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

    const config = await getAlertaCoberturaConfig(ctx.tenantId);
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[AlertasCobertura] Error al obtener config:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuración" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
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
    if (!hasCapability(perms, "alerta_cobertura_config")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para configurar alertas de cobertura" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, actualizarConfigSchema);
    if (parsed.error) return parsed.error;

    const config = await updateAlertaCoberturaConfig(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[AlertasCobertura] Error al actualizar config:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar configuración" },
      { status: 500 },
    );
  }
}
