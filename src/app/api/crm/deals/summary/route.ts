/**
 * API Route: GET /api/crm/deals/summary
 * Resumen de pipeline (conteos + montos de etapas abiertas). Solo lectura.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import type { DealsFocus } from "@/lib/crm/list-deals";
import { getDealsPipelineSummary } from "@/lib/crm/deals-pipeline-summary";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "deals");
    if (forbidden) return forbidden;

    const sp = request.nextUrl.searchParams;
    const search = sp.get("search") || undefined;
    const focusRaw = sp.get("focus");
    const focus = (
      focusRaw === "all" ||
      focusRaw === "proposals-sent-30d" ||
      focusRaw === "won-after-proposal-30d" ||
      focusRaw === "followup-open" ||
      focusRaw === "followup-overdue"
        ? focusRaw
        : "all"
    ) as DealsFocus;

    const summary = await getDealsPipelineSummary({
      tenantId: ctx.tenantId,
      focus,
      search,
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error("[CRM] Error fetching deals pipeline summary:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch deals summary" },
      { status: 500 },
    );
  }
}
