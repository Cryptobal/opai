/**
 * API Route: /api/cpq/bundles/[id]/sync-conditions
 * POST - Copia condiciones comerciales a todas las cotizaciones miembro
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { BundleServiceError } from "@/modules/cpq/bundles/bundle.service";
import { syncBundleConditions } from "@/modules/cpq/bundles/bundle-members.service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id: bundleId } = await params;
    const body = await request.json().catch(() => ({}));

    try {
      const result = await syncBundleConditions({
        tenantId: ctx.tenantId,
        bundleId,
        sourceQuoteId: body?.sourceQuoteId ?? null,
      });
      return NextResponse.json({ success: true, data: result });
    } catch (e) {
      if (e instanceof BundleServiceError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: e.status },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("[cpq/bundles/sync-conditions]", error);
    return NextResponse.json(
      { success: false, error: "Error al sincronizar condiciones" },
      { status: 500 },
    );
  }
}
