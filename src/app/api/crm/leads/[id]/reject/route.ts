/**
 * API Route: /api/crm/leads/[id]/reject
 * POST - Rechazar lead (mantener en CRM Leads) con motivo y correo opcional.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { rejectLeadSchema } from "@/lib/validations/crm";
import { requireTenantModule } from "@/lib/require-module";
import { rejectLead } from "@/modules/crm/leads/reject-lead.service";

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
    const parsed = await parseBody(request, rejectLeadSchema);
    if (parsed.error) return parsed.error;

    return rejectLead({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      leadId: id,
      body: parsed.data,
    });
  } catch (error) {
    console.error("Error rejecting CRM lead:", error);
    return NextResponse.json(
      { success: false, error: "Error al rechazar el lead" },
      { status: 500 },
    );
  }
}
