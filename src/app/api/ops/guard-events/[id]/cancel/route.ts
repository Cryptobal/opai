import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ops/guard-events/[id]/cancel — DEPRECATED
 * Events can now be deleted directly. No cancel workflow needed.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return NextResponse.json(
    { success: false, error: "Los eventos ahora se eliminan directamente. Este endpoint ya no se usa." },
    { status: 410 },
  );
}
