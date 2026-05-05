import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";
import { seedWaTemplatesForTenant } from "@/lib/docs/seed-wa-templates";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/seed-wa-templates
 * Body: { tenantId: string, all?: boolean }
 *
 * Si all=true, re-siembra todos los tenants. Si no, solo el tenantId provisto.
 * Idempotente: no sobrescribe plantillas existentes.
 *
 * Auth: Platform Admin (requirePlatformAuth) — operación cross-tenant.
 */
export async function POST(request: NextRequest) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    tenantId?: string;
    all?: boolean;
  };

  let tenantIds: string[] = [];
  if (body.all) {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    tenantIds = tenants.map((t) => t.id);
  } else if (body.tenantId) {
    tenantIds = [body.tenantId];
  } else {
    return NextResponse.json(
      { success: false, error: "Debes pasar tenantId o all=true" },
      { status: 400 },
    );
  }

  // createdBy se registra como el platformAdminId del actor que disparó el seed.
  // El campo en el schema es String libre (no FK), así que esto identifica
  // unívocamente al admin de plataforma sin chocar con el FK de Admin.
  const results = [];
  for (const tid of tenantIds) {
    const r = await seedWaTemplatesForTenant(tid, ctx.platformAdminId);
    results.push(r);
  }

  return NextResponse.json({ success: true, data: { results } });
}
