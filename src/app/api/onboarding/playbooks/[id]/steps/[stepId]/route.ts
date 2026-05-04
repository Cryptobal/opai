/**
 * DELETE /api/onboarding/playbooks/[id]/steps/[stepId] → elimina un step
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    if (!["owner", "admin"].includes(ctx.userRole)) {
      return NextResponse.json(
        { success: false, error: "Solo administradores" },
        { status: 403 },
      );
    }

    const { id, stepId } = await params;
    const playbook = await prisma.onboardingPlaybook.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!playbook) {
      return NextResponse.json(
        { success: false, error: "Playbook no encontrado" },
        { status: 404 },
      );
    }

    const step = await prisma.onboardingPlaybookStep.findFirst({
      where: { id: stepId, playbookId: id },
      select: { id: true },
    });
    if (!step) {
      return NextResponse.json(
        { success: false, error: "Step no encontrado" },
        { status: 404 },
      );
    }

    await prisma.onboardingPlaybookStep.delete({ where: { id: stepId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[onboarding] delete step failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete playbook step" },
      { status: 500 },
    );
  }
}
