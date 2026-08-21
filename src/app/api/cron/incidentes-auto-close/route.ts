import { NextRequest, NextResponse } from "next/server";
import { autoCerrarIncidentes } from "@/lib/incidentes-instalacion/lifecycle";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await autoCerrarIncidentes(200);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[cron/incidentes-auto-close]", err);
    return NextResponse.json({ success: false, error: "cron failed" }, { status: 500 });
  }
}
