/**
 * GET — estado de la migración documental del tenant actual.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { canView } from "@/lib/permissions";
import { getPermissionsFromAuth } from "@/lib/permissions-server";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await getPermissionsFromAuth(ctx);
    if (!canView(perms, "config")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const state = await prisma.docsMigrationState.findUnique({
      where: { tenantId: ctx.tenantId },
    });

    const needsAttention = await prisma.documento.count({
      where: { tenantId: ctx.tenantId, needsAttention: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        status: state?.status ?? "pending",
        stats: state?.stats ?? null,
        parityReport: state?.parityReport ?? null,
        failureReason: state?.failureReason ?? null,
        startedAt: state?.startedAt?.toISOString() ?? null,
        completedAt: state?.completedAt?.toISOString() ?? null,
        updatedAt: state?.updatedAt?.toISOString() ?? null,
        needsAttention,
      },
    });
  } catch (error) {
    console.error("[docs-migration-status]", error);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}
