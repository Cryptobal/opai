import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";
import { getUsageStats } from "@/lib/platform-ai-service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePlatformAuth();
    if (!ctx) return platformUnauthorized();

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
