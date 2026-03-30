import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveApiPerms } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { hasCapability } from "@/lib/permissions";
import { geocodeAddress } from "@/lib/geocoding";

/**
 * POST /api/ops/geocoding/batch
 *
 * Geocodes all guards with addressFormatted but missing lat/lng.
 * Rate-limited to avoid Google API quota issues.
 * Auth: requires alerta_cobertura_config capability.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "alerta_cobertura_config")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    // Find guards with address but no coordinates
    const pendientes = await prisma.opsPersona.findMany({
      where: {
        tenantId: ctx.tenantId,
        address: { not: null },
        OR: [{ lat: null }, { lng: null }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        address: true,
      },
      take: 50, // Process max 50 per batch to stay within rate limits
    });

    if (pendientes.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Todos los guardias con dirección ya tienen coordenadas",
        processed: 0,
        geocoded: 0,
        failed: 0,
      });
    }

    let geocoded = 0;
    let failed = 0;
    const results: Array<{ id: string; nombre: string; status: string }> = [];

    for (const persona of pendientes) {
      if (!persona.address) continue;

      try {
        const coords = await geocodeAddress(persona.address);
        if (coords) {
          await prisma.opsPersona.update({
            where: { id: persona.id },
            data: { lat: coords.lat, lng: coords.lng },
          });
          geocoded++;
          results.push({
            id: persona.id,
            nombre: `${persona.firstName} ${persona.lastName}`,
            status: `OK (${coords.lat}, ${coords.lng})`,
          });
        } else {
          failed++;
          results.push({
            id: persona.id,
            nombre: `${persona.firstName} ${persona.lastName}`,
            status: "No se pudo geocodificar",
          });
        }

        // Rate limit: 100ms between requests (10 req/sec, well within Google's 50 QPS)
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (e: any) {
        failed++;
        results.push({
          id: persona.id,
          nombre: `${persona.firstName} ${persona.lastName}`,
          status: `Error: ${e?.message || "desconocido"}`,
        });
      }
    }

    console.log(`[Geocoding:Batch] Processed ${pendientes.length}: ${geocoded} OK, ${failed} failed`);

    return NextResponse.json({
      success: true,
      processed: pendientes.length,
      geocoded,
      failed,
      results,
    });
  } catch (error) {
    console.error("[Geocoding:Batch] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error en geocoding batch" },
      { status: 500 },
    );
  }
}
