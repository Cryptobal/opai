import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, hasCapability } from "@/lib/permissions";
import { checkPendingRounds } from "@/lib/rondas/alert-engine";
import { requireTenantModule } from '@/lib/require-module';

export async function POST(request: NextRequest) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    // Support two auth methods:
    // 1. CRON_SECRET header (for Vercel Cron / automated calls)
    // 2. User session (for manual trigger from admin UI)
    const cronSecret = request.headers.get("authorization")?.replace("Bearer ", "");
    const isCronAuth = cronSecret && cronSecret === process.env.CRON_SECRET;

    let tenantId: string;

    if (isCronAuth) {
      // Cron mode: run for all tenants (or a specific one from query)
      tenantId = request.nextUrl.searchParams.get("tenantId") ?? "";
      if (!tenantId) {
        return NextResponse.json({ success: false, error: "tenantId requerido para cron" }, { status: 400 });
      }
    } else {
      // User session mode
      const ctx = await requireAuth();
      if (!ctx) return unauthorized();
      const perms = await resolveApiPerms(ctx);
      if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
        return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
      }
      tenantId = ctx.tenantId;
    }

    const result = await checkPendingRounds(tenantId);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("[CRON_CHECK_PENDING]", err);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
