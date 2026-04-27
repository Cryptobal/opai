/**
 * API Route: /api/crm/email-dead-letters
 * GET - Lista emails fallidos no resueltos del tenant del usuario.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";

export async function GET() {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "leads");
    if (forbidden) return forbidden;

    const items = await prisma.emailDeadLetter.findMany({
      where: { tenantId: ctx.tenantId, resolved: false },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("Error listing email dead letters:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list dead letters" },
      { status: 500 }
    );
  }
}
