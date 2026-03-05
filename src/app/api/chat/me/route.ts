/**
 * API Route: /api/chat/me
 * GET — Returns the current authenticated user's ID and name for chat.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    return NextResponse.json({
      success: true,
      data: { userId: ctx.userId },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
