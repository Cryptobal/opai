/**
 * API Route: /api/crm/email-dead-letters
 * GET - Lista los emails fallidos no resueltos del tenant del usuario.
 *
 * Solo usuarios con permisos crm.edit pueden ver la cola (cross-cutting,
 * no se restringe a un submódulo).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const url = new URL(request.url);
    const includeResolved = url.searchParams.get("includeResolved") === "true";

    const items = await prisma.emailDeadLetter.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(includeResolved ? {} : { resolved: false }),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        purpose: true,
        refId: true,
        errorMessage: true,
        retryCount: true,
        resolved: true,
        createdAt: true,
        resolvedAt: true,
      },
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
