/**
 * API Route: /api/chat/me
 * GET — Returns the current authenticated user's ID, name and avatar for chat.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";

export async function GET() {
  try {
    const modCheck = await requireTenantModule("chat");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const admin = await prisma.admin.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { id: true, name: true, photoUrl: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: ctx.userId,
        name: admin?.name ?? null,
        photoUrl: admin?.photoUrl ?? null,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
