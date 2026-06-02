/**
 * API Route: /api/crm/company-enrich
 * POST - Extrae datos públicos desde sitio web y genera resumen en español con IA.
 *
 * La lógica vive en @/lib/company-enrich para poder reutilizarla sin auth
 * (auto-enriquecimiento de leads creados desde la web pública / email entrante).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { enrichCompanyFromWebsite, describeFetchFailure } from "@/lib/company-enrich";

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const body = (await request.json()) as { website?: string; companyName?: string };
    const rawWebsite = body.website?.trim() || "";
    const companyName = body.companyName?.trim() || "";
    if (!rawWebsite && !companyName) {
      return NextResponse.json(
        { success: false, error: "Debes ingresar una página web o el nombre de la empresa." },
        { status: 400 },
      );
    }

    const data = await enrichCompanyFromWebsite({
      website: rawWebsite,
      companyName,
      tenantId: ctx.tenantId,
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const friendly = describeFetchFailure(error);
    const msg = friendly
      ? friendly
      : error instanceof Error
        ? error.message
        : "No se pudo analizar el sitio web.";
    if (friendly) {
      console.warn("[company-enrich] sitio externo no accesible:", msg);
    } else {
      console.error("Error in company enrich:", error);
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
