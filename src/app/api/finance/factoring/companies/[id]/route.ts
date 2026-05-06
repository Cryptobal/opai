/**
 * GET    /api/finance/factoring/companies/[id]  — detail
 * PATCH  /api/finance/factoring/companies/[id]  — update
 * DELETE /api/finance/factoring/companies/[id]  — soft delete (deactivate)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  parseBody,
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { factoringCompanyUpdateSchema } from "@/lib/validations/factoring";
import {
  deactivateFactoringCompany,
  getFactoringCompany,
  updateFactoringCompany,
} from "@/modules/finance/factoring/factoring-companies.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }
  const { id } = await params;
  const company = await getFactoringCompany(ctx.tenantId, id);
  if (!company) {
    return NextResponse.json(
      { success: false, error: "Factoring no encontrado" },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, company });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para configurar factoring" },
      { status: 403 },
    );
  }
  const { id } = await params;
  const parsed = await parseBody(request, factoringCompanyUpdateSchema);
  if (parsed.error) return parsed.error;

  try {
    const company = await updateFactoringCompany(ctx.tenantId, id, parsed.data);
    return NextResponse.json({ success: true, company });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error actualizando",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para configurar factoring" },
      { status: 403 },
    );
  }
  const { id } = await params;
  try {
    const company = await deactivateFactoringCompany(ctx.tenantId, id);
    return NextResponse.json({ success: true, company });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Error desactivando",
      },
      { status: 400 },
    );
  }
}
