import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";

// ── GET: current DTE provider config (from env) ──

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "finance", "configuracion")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver configuración DTE" },
        { status: 403 },
      );
    }

    const provider = process.env.DTE_PROVIDER ?? "STUB";
    const apiUrl = process.env.DTE_API_URL ?? "";
    const hasApiKey = !!process.env.DTE_API_KEY;
    const hasCertificate = !!process.env.DTE_CERTIFICATE_PASSWORD;

    return NextResponse.json({
      success: true,
      data: {
        provider,
        apiUrl,
        hasApiKey,
        hasCertificate,
        isConfigured: provider !== "STUB" && hasApiKey,
      },
    });
  } catch (error) {
    console.error("[Finance] Error getting DTE provider config:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la configuración del proveedor DTE" },
      { status: 500 },
    );
  }
}
