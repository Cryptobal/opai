import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureTenantCatalogSeeded } from "@/lib/vra/seed-tenant-catalog";

export const dynamic = "force-dynamic";

/**
 * POST /api/vra/section-templates/seed
 * Siembra el catálogo de secciones del tenant clonando el system catalog
 * y asegura el TipoDocOperacional "informe_vulnerabilidad" para el linkaje futuro.
 * Idempotente: solo clona keys que no existen.
 */
export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const result = await ensureTenantCatalogSeeded(ctx.tenantId, ctx.userId);

    return NextResponse.json({
      success: true,
      created: result.created,
      skipped: result.skipped,
      tipoDocCreated: result.tipoDocCreated,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] seed error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
