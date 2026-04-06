import { NextRequest, NextResponse } from "next/server";
import { handleIndeedApplication, type IndeedApplyPayload } from "@/lib/ats/indeed.service";

/**
 * POST /api/ops/ats/indeed/webhook
 * Indeed Apply webhook endpoint. Receives applications submitted via
 * Indeed's apply flow and stores them as AtsApplication rows.
 *
 * Indeed expects a 200 response with a specific JSON shape. We must also
 * deduplicate applications: same job + same email within a 120-day window
 * should be treated as an update, not a new application.
 */
export async function POST(req: NextRequest) {
  let payload: IndeedApplyPayload;
  try {
    payload = (await req.json()) as IndeedApplyPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!payload?.jobId || !payload?.applicant?.email) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const result = await handleIndeedApplication(payload);
  if (!result.success) {
    return NextResponse.json({ status: "error", error: result.error }, { status: 500 });
  }
  return NextResponse.json({ status: "ok" });
}
