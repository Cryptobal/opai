import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import { getUsageSummary } from "@/lib/platform-ai-service";

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePlatformAuth({ minRole: 'support' });
    if (!auth.ok) return auth.response;
    const ctx = auth.ctx;

    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId") || undefined;
    const feature = url.searchParams.get("feature") || undefined;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const summary = await getUsageSummary({
      tenantId,
      feature,
      from: from ? new Date(from) : undefined,
      // `to` inclusivo hasta el final del día seleccionado.
      to: to ? new Date(`${to}T23:59:59.999`) : undefined,
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    console.error("[platform/ai-usage/summary] GET error:", err);
    return NextResponse.json(
      { success: false, error: "Error al obtener el resumen de consumo" },
      { status: 500 },
    );
  }
}
