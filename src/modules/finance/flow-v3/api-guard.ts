import "server-only";
import { NextResponse } from "next/server";
import { requireAuth, resolveApiPerms, unauthorized, type AuthContext } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";

/**
 * Guard estándar de las rutas /api/finance/flow-v3: mismos permisos que el
 * módulo finance actual (cashflow_view para lectura, cashflow_manage para
 * mutaciones). El tenantId SIEMPRE sale de la sesión, jamás del body.
 */
export async function requireFlowV3(
  capability: "cashflow_view" | "cashflow_manage",
): Promise<{ ctx: AuthContext; error?: never } | { ctx?: never; error: NextResponse }> {
  const ctx = await requireAuth();
  if (!ctx) return { error: unauthorized() };
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, capability)) {
    return {
      error: NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 }),
    };
  }
  return { ctx };
}

export function flowV3Error(error: unknown, fallback = "Error interno"): NextResponse {
  const message = error instanceof Error ? error.message : fallback;
  const known =
    /no encontrada|no encontrado|requerido|inválid|archivada|no puede|no pertenece|no está vinculada/i.test(
      message,
    );
  return NextResponse.json(
    { success: false, error: known ? message : fallback },
    { status: known ? 400 : 500 },
  );
}
