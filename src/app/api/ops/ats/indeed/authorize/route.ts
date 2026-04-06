import { NextRequest, NextResponse } from "next/server";
import { getIndeedAuthUrl } from "@/lib/ats/indeed.service";

/**
 * GET /api/ops/ats/indeed/authorize?tenantId=...
 * Redirects the tenant admin to Indeed's OAuth consent screen.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }
  const url = getIndeedAuthUrl(tenantId);
  return NextResponse.redirect(url);
}
