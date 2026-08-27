import { NextResponse } from "next/server";
import { requireAuth, resolveApiPerms, unauthorized } from "@/lib/api-auth";
import { canEdit, canView } from "@/lib/permissions";
import type { AuthContext } from "@/lib/api-auth";

export async function requireReportQrAuth(
  mode: "view" | "edit",
): Promise<{ ctx: AuthContext; error?: never } | { ctx?: never; error: NextResponse }> {
  const ctx = await requireAuth();
  if (!ctx) return { error: unauthorized() };
  const perms = await resolveApiPerms(ctx);
  const ok = mode === "edit" ? canEdit(perms, "ops", "tickets") : canView(perms, "ops", "tickets");
  if (!ok) {
    return {
      error: NextResponse.json(
        { success: false, error: "Sin permisos para señalética QR de incidentes" },
        { status: 403 },
      ),
    };
  }
  return { ctx };
}
