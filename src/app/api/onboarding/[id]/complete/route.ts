/**
 * POST /api/onboarding/[id]/complete
 * Marca un onboarding como completado manualmente.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const onboarding = await prisma.clientOnboarding.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { steps: { select: { id: true } } },
    });
    if (!onboarding) {
      return NextResponse.json(
        { success: false, error: "Onboarding no encontrado" },
        { status: 404 },
      );
    }
    if (onboarding.status !== "in_progress") {
      return NextResponse.json(
        { success: false, error: "El onboarding ya no está en progreso" },
        { status: 400 },
      );
    }

    const updated = await prisma.clientOnboarding.update({
      where: { id },
      data: { status: "completed", completedAt: new Date() },
    });

    try {
      const { notify } = await import("@/lib/notifications/notify");
      const account = await prisma.crmAccount.findUnique({
        where: { id: onboarding.accountId },
        select: { name: true, ownerId: true },
      });
      const targetIds = [onboarding.createdBy, account?.ownerId].filter(
        (x): x is string => !!x,
      );
      if (targetIds.length > 0) {
        await notify({
          tenantId: ctx.tenantId,
          type: "onboarding_completed",
          audience: "admin",
          targetType: "ADMIN",
          targetIds,
          title: `Onboarding completado: ${account?.name ?? "Cliente"}`,
          body: "El onboarding del cliente fue marcado como completado.",
          data: {
            onboardingId: id,
            accountId: onboarding.accountId,
            dealId: onboarding.dealId,
          },
          link: `/crm/accounts/${onboarding.accountId}/onboarding/${id}`,
        });
      }
    } catch (e) {
      console.error("[onboarding] complete notify failed:", e);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[onboarding] complete failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to complete onboarding" },
      { status: 500 },
    );
  }
}
