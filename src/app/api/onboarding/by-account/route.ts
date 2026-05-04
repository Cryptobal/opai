/**
 * GET /api/onboarding/by-account?accountId=...
 *
 * Devuelve el resumen del onboarding del cliente para una cuenta:
 * - Si existe ClientOnboarding ligado a un deal de la cuenta → resumen.
 * - Si no existe pero hay un deal won sin onboarding → pendingDealId.
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

    const accountId = request.nextUrl.searchParams.get("accountId");
    if (!accountId) {
      return NextResponse.json(
        { success: false, error: "accountId requerido" },
        { status: 400 },
      );
    }

    const account = await prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta no encontrada" },
        { status: 404 },
      );
    }

    const onboarding = await prisma.clientOnboarding.findFirst({
      where: { accountId, tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        steps: {
          select: { id: true, status: true, ticketId: true },
        },
      },
    });

    if (onboarding) {
      const total = onboarding.steps.length;
      const done = onboarding.steps.filter(
        (s) =>
          s.status === "skipped" ||
          s.status === "resolved" ||
          s.status === "closed",
      ).length;

      const ticketIds = onboarding.steps
        .map((s) => s.ticketId)
        .filter((x): x is string => !!x);
      let nextDueAt: Date | null = null;
      if (ticketIds.length > 0) {
        const next = await prisma.opsTicket.findFirst({
          where: {
            id: { in: ticketIds },
            tenantId: ctx.tenantId,
            status: { notIn: ["resolved", "closed", "rejected", "cancelled"] },
            slaDueAt: { not: null },
          },
          orderBy: { slaDueAt: "asc" },
          select: { slaDueAt: true },
        });
        nextDueAt = next?.slaDueAt ?? null;
      }

      return NextResponse.json({
        success: true,
        data: {
          hasOnboarding: true,
          onboarding: {
            id: onboarding.id,
            status: onboarding.status,
            startedAt: onboarding.startedAt,
            completedAt: onboarding.completedAt,
            serviceStartDate: onboarding.serviceStartDate,
            total,
            done,
            nextDueAt,
          },
        },
      });
    }

    const wonDeal = await prisma.crmDeal.findFirst({
      where: { accountId, tenantId: ctx.tenantId, status: "won" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (!wonDeal) {
      return NextResponse.json({
        success: true,
        data: { hasOnboarding: false },
      });
    }

    const seed = await ensureDefaultPlaybook(ctx.tenantId);
    return NextResponse.json({
      success: true,
      data: {
        hasOnboarding: false,
        pendingDealId: wonDeal.id,
        defaultPlaybookId: seed.playbookId,
      },
    });
  } catch (error) {
    console.error("[onboarding] by-account failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch onboarding for account" },
      { status: 500 },
    );
  }
}
