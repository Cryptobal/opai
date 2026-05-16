import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { findRutOccupants } from "@/modules/finance/banking/rut-conflict-detector";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/banking/rut-occupants?rut=...
 *
 * Lista las entidades del tenant que tienen ese RUT registrado.
 * Sirve para mostrar warning de duplicados en conciliación.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }
    const { searchParams } = new URL(request.url);
    const rut = searchParams.get("rut");
    if (!rut) {
      return NextResponse.json(
        { success: false, error: "Falta rut" },
        { status: 400 },
      );
    }
    const occupants = await findRutOccupants(ctx.tenantId, rut);
    return NextResponse.json({ success: true, data: occupants });
  } catch (error) {
    console.error("[Finance/Banking/RutOccupants] error:", error);
    return NextResponse.json(
      { success: false, error: "Error" },
      { status: 500 },
    );
  }
}
