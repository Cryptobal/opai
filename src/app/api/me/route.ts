import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/me
 * Devuelve datos básicos del usuario autenticado para que los componentes
 * cliente sepan qué acciones (delete, admin) pueden mostrar.
 */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  return NextResponse.json({
    success: true,
    user: {
      id: ctx.userId,
      email: ctx.userEmail,
      role: ctx.userRole,
      tenantId: ctx.tenantId,
    },
  });
}
