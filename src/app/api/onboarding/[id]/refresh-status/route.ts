/**
 * POST /api/onboarding/[id]/refresh-status
 * Sincroniza status de cada step con su OpsTicket.
 * Si todos los steps están resolved/skipped, marca onboarding como completed.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";

const TERMINAL = new Set(["resolved", "closed", "rejected", "cancelled"]);
const SKIPPED = new Set(["skipped"]);

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
      include: { steps: true },
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
          select: { id: true, status: true, resolvedAt: true },
        })
      : [];
    const tById = new Map(tickets.map((t) => [t.id, t]));

    let updated = 0;
    for (const step of onboarding.steps) {
      if (!step.ticketId) continue;
      const ticket = tById.get(step.ticketId);
      if (!ticket) continue;
      if (ticket.status === step.status) continue;
      await prisma.clientOnboardingStep.update({
        where: { id: step.id },
        data: {
          status: ticket.status,
          resolvedAt:
            ticket.status === "resolved" || ticket.status === "closed"
              ? ticket.resolvedAt ?? new Date()
              : null,
        },
      });
      updated++;
    }

    const refreshed = await prisma.clientOnboardingStep.findMany({
      where: { onboardingId: id },
      select: { status: true },
    });
    const allDone = refreshed.every(
      (s) => TERMINAL.has(s.status) || SKIPPED.has(s.status),
    );
    if (allDone && onboarding.status === "in_progress") {
      await prisma.clientOnboarding.update({
        where: { id },
        data: { status: "completed", completedAt: new Date() },
      });
    }

    return NextResponse.json({ success: true, data: { updated, allDone } });
  } catch (error) {
    console.error("[onboarding] refresh-status failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to refresh status" },
      { status: 500 },
    );
  }
}
