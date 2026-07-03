/**
 * Guard de autorización para las rutas de configuración de Slack.
 * Requiere sesión NextAuth + rol admin del tenant (owner | admin).
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized, type AuthContext } from "@/lib/api-auth";

export async function requireSlackAdmin(): Promise<
  { ctx: AuthContext; error?: never } | { ctx?: never; error: NextResponse }
> {
  const ctx = await requireAuth();
  if (!ctx) return { error: unauthorized() };
  if (!["owner", "admin"].includes(ctx.userRole ?? "")) {
    return {
      error: NextResponse.json(
        { success: false, error: "Solo administradores pueden configurar Slack" },
        { status: 403 },
      ),
    };
  }
  return { ctx };
}
