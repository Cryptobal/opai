/**
 * API Route: /api/crm/leads/[id]/approve
 * POST - Aprobar prospecto y convertir a cuenta + contacto + negocio + instalaciones.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { approveLead } from "@/modules/crm/leads/approve-lead.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "leads");
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();
    return approveLead({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      leadId: id,
      body,
    });
  } catch (error) {
    console.error("Error approving CRM lead:", error);
    const msg = error instanceof Error ? error.message : "Error al aprobar el lead";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
