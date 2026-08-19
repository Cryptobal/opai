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
): Promise<
  | { ctx: AuthContext; canManage: boolean; error?: never }
  | { ctx?: never; canManage?: never; error: NextResponse }
> {
  const ctx = await requireAuth();
  if (!ctx) return { error: unauthorized() };
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, capability)) {
    return {
      error: NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 }),
    };
  }
  // `canManage` permite que el caller decida acciones de escritura implícitas
  // (ej. el auto-bootstrap de la planilla) sin re-resolver permisos.
  return { ctx, canManage: hasCapability(perms, "cashflow_manage") };
}

export function flowV3Error(error: unknown, fallback = "Error interno"): NextResponse {
  const message = error instanceof Error ? error.message : fallback;
  if (
    error instanceof Error &&
    (error.name === "FlowRowConflictError" || /ya usa esta llave|ya está en uso/i.test(message))
  ) {
    return NextResponse.json({ success: false, error: message }, { status: 409 });
  }
  const known =
    /no encontrada|no encontrado|requerido|inválid|archivada|no puede|no pertenecen|no pertenece|no está vinculada|vinculad|programación|cuota|lunes ISO|misma cuenta|admiten|Nada que actualizar|no hay nada que guardar/i.test(
      message,
    );
  return NextResponse.json(
    { success: false, error: known ? message : fallback },
    { status: known ? 400 : 500 },
  );
}
