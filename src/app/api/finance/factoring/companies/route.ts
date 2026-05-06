/**
 * GET   /api/finance/factoring/companies — list catálogo factorings
 * POST  /api/finance/factoring/companies — create
 */

import { NextRequest, NextResponse } from "next/server";
import {
  parseBody,
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { factoringCompanyInputSchema } from "@/lib/validations/factoring";
import {
  createFactoringCompany,
  listFactoringCompanies,
} from "@/modules/finance/factoring/factoring-companies.service";

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("includeInactive") === "1";
  const search = url.searchParams.get("search") ?? undefined;

  const companies = await listFactoringCompanies(ctx.tenantId, {
    includeInactive,
    search,
  });
  return NextResponse.json({ success: true, companies });
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para configurar factoring" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, factoringCompanyInputSchema);
  if (parsed.error) return parsed.error;

  try {
    const company = await createFactoringCompany(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, company }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error creando factoring",
      },
      { status: 400 },
    );
  }
}
