/**
 * POST /api/onboarding/playbooks/[id]/steps → agrega un step a un playbook
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { playbookStepCreateSchema } from "@/lib/validations/onboarding";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params;
    const parsed = await parseBody(request, playbookStepCreateSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

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

    const sortOrder =
      body.sortOrder ??
      ((
        await prisma.onboardingPlaybookStep.aggregate({
          where: { playbookId: id },
          _max: { sortOrder: true },
        })
      )._max.sortOrder ?? 0) + 1;

    const step = await prisma.onboardingPlaybookStep.create({
      data: {
        playbookId: id,
        phase: body.phase,
        sortOrder,
        slug: body.slug,
        title: body.title,
        description: body.description,
        ticketTypeSlug: body.ticketTypeSlug,
        defaultAssignedTeam: body.defaultAssignedTeam,
        defaultAssignedUserId: body.defaultAssignedUserId ?? null,
        defaultPriority: body.defaultPriority,
        dueDateOffsetDays: body.dueDateOffsetDays,
        defaultApplies: body.defaultApplies,
      },
    });

    return NextResponse.json({ success: true, data: step });
  } catch (error) {
    console.error("[onboarding] create step failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create playbook step" },
      { status: 500 },
    );
  }
}
