/**
 * API Route: /api/chat/me
 * GET — Returns the current authenticated user's ID and name for chat.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';

export async function GET() {
  try {
    const modCheck = await requireTenantModule('chat');
    if (!modCheck.authorized) return modCheck.response;

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
