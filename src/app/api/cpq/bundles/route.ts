/**
 * API Route: /api/cpq/bundles
 * POST - Crear propuesta multi-instalación (dealId requerido)
 * GET  - Listar propuestas por dealId
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView, requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import {
  BundleServiceError,
  createBundle,
  listBundlesByDeal,
} from "@/modules/cpq/bundles/bundle.service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    const dealId = new URL(request.url).searchParams.get("dealId")?.trim();
    if (!dealId) {
      return NextResponse.json(
        { success: false, error: "dealId es requerido" },
        { status: 400 },
      );
    }

    const data = await listBundlesByDeal({
      tenantId: ctx.tenantId,
      dealId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[cpq/bundles GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al listar propuestas" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json().catch(() => ({}));
    const dealId =
      typeof body?.dealId === "string" ? body.dealId.trim() : "";
    if (!dealId) {
      return NextResponse.json(
        { success: false, error: "dealId es requerido" },
        { status: 400 },
      );
    }

    const name =
      typeof body?.name === "string" ? body.name.trim() : null;
    const importDealQuotes = body?.importDealQuotes !== false;

    try {
      const created = await createBundle({
        tenantId: ctx.tenantId,
        dealId,
        name,
        importDealQuotes,
      });
      return NextResponse.json({ success: true, data: created }, { status: 201 });
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
    console.error("[cpq/bundles POST]", error);
    return NextResponse.json(
      { success: false, error: "Error al crear propuesta" },
      { status: 500 },
    );
  }
}
