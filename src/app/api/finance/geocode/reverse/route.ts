import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { reverseGeocode } from "@/lib/geocoding";

/**
 * GET /api/finance/geocode/reverse?lat=..&lng=..
 * Resuelve una dirección legible desde coordenadas GPS (server-side, key server).
 */

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const lat = Number(request.nextUrl.searchParams.get("lat"));
    const lng = Number(request.nextUrl.searchParams.get("lng"));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { success: false, error: "Coordenadas inválidas" },
        { status: 400 },
      );
    }

    const address = await reverseGeocode(lat, lng);
    return NextResponse.json({ success: true, data: { address } });
  } catch (error) {
    console.error("[Finance] Error reverse geocoding:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo resolver la dirección" },
      { status: 500 },
    );
  }
}
