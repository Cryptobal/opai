import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ops/guard-events/[id]/reject — DEPRECATED
 * Events are now created directly as "approved". No workflow needed.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return NextResponse.json(
    { success: false, error: "Los eventos se crean directamente como aprobados. Este endpoint ya no se usa." },
    { status: 410 },
  );
}
