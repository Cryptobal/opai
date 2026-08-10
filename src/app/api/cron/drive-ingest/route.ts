import { NextRequest, NextResponse } from "next/server";
import { ingestAllSharedDriveTenants } from "@/lib/google-workspace/drive-ingest.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await ingestAllSharedDriveTenants(10);
  return NextResponse.json({ ok: true, ...result });
}
