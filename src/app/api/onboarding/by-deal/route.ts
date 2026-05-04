/**
 * GET /api/onboarding/by-deal?dealId=...
 *
 * Devuelve si existe ClientOnboarding para ese deal. Si no, asegura el
 * playbook por defecto del tenant para que el frontend pueda abrir el modal.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { ensureDefaultPlaybook } from "@/lib/onboarding/seed-defaults";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const dealId = request.nextUrl.searchParams.get("dealId");
    if (!dealId) {
      return NextResponse.json(
        { success: false, error: "dealId requerido" },
        { status: 400 },
      );
    }

    const deal = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId: ctx.tenantId },
      select: { id: true, accountId: true },
    });
    if (!deal) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 },
      );
    }

    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { dealId },
      include: {
        steps: {
          select: { id: true, status: true },
        },
      },
    });

    if (onboarding && onboarding.tenantId === ctx.tenantId) {
      const account = await prisma.crmAccount.findFirst({
        where: { id: onboarding.accountId, tenantId: ctx.tenantId },
        select: { name: true },
      });
      const totalSteps = onboarding.steps.length;
      const completedSteps = onboarding.steps.filter((s) =>
        ["resolved", "closed", "skipped"].includes(s.status),
      ).length;
      return NextResponse.json({
        success: true,
        data: {
          exists: true,
          onboarding: {
            id: onboarding.id,
            accountId: onboarding.accountId,
            accountName: account?.name ?? null,
            status: onboarding.status,
            completedSteps,
            totalSteps,
          },
        },
      });
    }

    const seed = await ensureDefaultPlaybook(ctx.tenantId);
    return NextResponse.json({
      success: true,
      data: {
        exists: false,
        defaultPlaybookId: seed.playbookId,
      },
    });
  } catch (error) {
    console.error("[onboarding] by-deal failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch onboarding for deal" },
      { status: 500 },
    );
  }
}
