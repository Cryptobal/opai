/**
 * GET /api/onboarding/[id]
 * Devuelve el ClientOnboarding con steps + tickets + % completado.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { getPlatformConfigStatus } from "@/lib/onboarding/platform-status";

export async function GET(
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
      include: {
        playbook: { select: { id: true, name: true, version: true } },
        steps: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!onboarding) {
      return NextResponse.json(
        { success: false, error: "Onboarding no encontrado" },
        { status: 404 },
      );
    }

    const ticketIds = onboarding.steps
      .map((s) => s.ticketId)
      .filter((x): x is string => !!x);

    const tickets = ticketIds.length
      ? await prisma.opsTicket.findMany({
          where: { id: { in: ticketIds }, tenantId: ctx.tenantId },
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            priority: true,
            assignedTeam: true,
            assignedTo: true,
            slaDueAt: true,
            slaBreached: true,
            resolvedAt: true,
            closedAt: true,
          },
        })
      : [];
    const ticketsById = new Map(tickets.map((t) => [t.id, t]));

    const stepsWithTickets = onboarding.steps.map((s) => ({
      ...s,
      ticket: s.ticketId ? ticketsById.get(s.ticketId) ?? null : null,
    }));

    const total = onboarding.steps.length;
    const done = onboarding.steps.filter(
      (s) => s.status === "skipped" || s.status === "resolved" || s.status === "closed",
    ).length;
    const percentComplete = total === 0 ? 0 : Math.round((done / total) * 100);

    const platformConfigStatus = await getPlatformConfigStatus(
      ctx.tenantId,
      onboarding.installationId,
    );

    let account = null;
    if (onboarding.accountId) {
      account = await prisma.crmAccount.findUnique({
        where: { id: onboarding.accountId },
        select: { id: true, name: true, status: true },
      });
    }
    let installation = null;
    if (onboarding.installationId) {
      installation = await prisma.crmInstallation.findUnique({
        where: { id: onboarding.installationId },
        select: { id: true, name: true, address: true, marcacionCode: true },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...onboarding,
        steps: stepsWithTickets,
        percentComplete,
        platformConfigStatus,
        account,
        installation,
      },
    });
  } catch (error) {
    console.error("[onboarding] get failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get onboarding" },
      { status: 500 },
    );
  }
}
