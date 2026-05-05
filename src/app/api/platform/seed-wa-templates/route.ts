import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";
import { seedWaTemplatesForTenant } from "@/lib/docs/seed-wa-templates";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/platform/seed-wa-templates
 * Body: { tenantId: string, all?: boolean, createdByAdminId?: string }
 *
 * Si all=true, re-siembra todos los tenants. Si no, solo el tenantId provisto.
 * Idempotente: no sobrescribe plantillas existentes.
 *
 * Auth: Platform Admin (requirePlatformAuth) — operación cross-tenant.
 *
 * `createdByAdminId` es opcional: si no se provee, se usa el primer admin
 * activo del tenant (DocTemplate.createdBy referencia al modelo Admin).
 */
export async function POST(request: NextRequest) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    tenantId?: string;
    all?: boolean;
    createdByAdminId?: string;
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

  const results = [];
  for (const tid of tenantIds) {
    // Resolver createdBy: si no viene, tomar el primer admin activo del tenant.
    let createdBy = body.createdByAdminId;
    if (!createdBy) {
      const firstAdmin = await prisma.admin.findFirst({
        where: { tenantId: tid, status: "active" },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      if (!firstAdmin) {
        results.push({
          tenantId: tid,
          created: [],
          skipped: [],
          errors: [{ slug: "(all)", error: "Tenant sin admin activo" }],
        });
        continue;
      }
      createdBy = firstAdmin.id;
    }
    const r = await seedWaTemplatesForTenant(tid, createdBy);
    results.push(r);
  }

  return NextResponse.json({ success: true, data: { results } });
}
