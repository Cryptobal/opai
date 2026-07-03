/**
 * Guard de autorización compartido para rutas de configuración de integraciones.
 * Requiere sesión NextAuth + rol admin del tenant (owner | admin).
 * Reusado por Slack (requireSlackAdmin) y el servidor MCP.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized, type AuthContext } from "@/lib/api-auth";

export async function requireIntegrationAdmin(
  label = "esta integración",
): Promise<{ ctx: AuthContext; error?: never } | { ctx?: never; error: NextResponse }> {
  const ctx = await requireAuth();
  if (!ctx) return { error: unauthorized() };
  if (!["owner", "admin"].includes(ctx.userRole ?? "")) {
    return {
      error: NextResponse.json(
        { success: false, error: `Solo administradores pueden configurar ${label}` },
        { status: 403 },
      ),
    };
  }
  return { ctx };
}
