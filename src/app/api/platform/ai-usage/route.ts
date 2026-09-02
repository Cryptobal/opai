import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import { getUsageStats } from "@/lib/platform-ai-service";

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

    const stats = await getUsageStats({
      tenantId,
      feature,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

    return NextResponse.json({ success: true, data: stats });
  } catch (err) {
    console.error("[platform/ai-usage] GET error:", err);
    return NextResponse.json(
      { success: false, error: "Error al obtener estadísticas de uso" },
      { status: 500 },
    );
  }
}
