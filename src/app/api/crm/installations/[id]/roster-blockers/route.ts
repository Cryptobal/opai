import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { findActiveRosterForInstallation } from "@/lib/crm/installation-roster-guard";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "installations");
    if (forbidden) return forbidden;

    const { id } = await params;
    const blockers = await findActiveRosterForInstallation(ctx.tenantId, id);
    return NextResponse.json({ success: true, data: { blockers } });
  } catch (error) {
    console.error("[CRM] Error listing roster blockers:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo verificar el rol de la instalación" },
      { status: 500 },
    );
  }
}
