import { NextRequest, NextResponse } from "next/server";
import { exchangeIndeedCode } from "@/lib/ats/indeed.service";

/**
 * GET /api/ops/ats/indeed/callback?code=...&state=<tenantId>
 * Indeed OAuth callback. Exchanges the authorization code for tokens and
 * persists them on the IndeedIntegration row for the tenant.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.json({ error: "missing code/state" }, { status: 400 });
  }

  const result = await exchangeIndeedCode(code, state);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://opai.cl";
  const target = new URL("/opai/ats/configuracion", siteUrl);
  target.searchParams.set("indeed", result.success ? "connected" : "error");
  if (!result.success && result.error) {
    target.searchParams.set("error", result.error);
  }
  return NextResponse.redirect(target);
}
