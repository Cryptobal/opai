/**
 * POST /api/onboarding/playbooks/seed-default
 * Idempotente: crea (si faltan) los 6 OpsTicketType y el playbook default.
 * Solo owner/admin del tenant.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { ensureDefaultPlaybook } from "@/lib/onboarding/seed-defaults";

export async function POST() {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    if (!["owner", "admin"].includes(ctx.userRole)) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden ejecutar el seed" },
        { status: 403 },
      );
    }

    const result = await ensureDefaultPlaybook(ctx.tenantId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[onboarding] seed-default failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to seed onboarding default playbook" },
      { status: 500 },
    );
  }
}
