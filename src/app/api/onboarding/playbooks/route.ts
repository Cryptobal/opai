/**
 * GET  /api/onboarding/playbooks      → lista de playbooks del tenant
 * POST /api/onboarding/playbooks      → crea un nuevo playbook (puede clonar default)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { playbookCreateSchema } from "@/lib/validations/onboarding";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "true";
    const playbooks = await prisma.onboardingPlaybook.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }, { version: "desc" }],
      include: { _count: { select: { steps: true } } },
    });

    return NextResponse.json({
      success: true,
      data: playbooks.map((p) => ({
        id: p.id,
        name: p.name,
        version: p.version,
        isDefault: p.isDefault,
        isActive: p.isActive,
        description: p.description,
        stepCount: p._count.steps,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (error) {
    console.error("[onboarding] list playbooks failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list playbooks" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
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

    const parsed = await parseBody(request, playbookCreateSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const playbook = await prisma.$transaction(async (tx) => {
      const created = await tx.onboardingPlaybook.create({
        data: {
          tenantId: ctx.tenantId,
          name: body.name,
          description: body.description,
          isDefault: body.isDefault ?? false,
          isActive: true,
        },
      });

      if (body.cloneFromDefault) {
        const defaultPb = await tx.onboardingPlaybook.findFirst({
          where: { tenantId: ctx.tenantId, isDefault: true, NOT: { id: created.id } },
          include: { steps: true },
        });
        if (defaultPb) {
          for (const s of defaultPb.steps) {
            await tx.onboardingPlaybookStep.create({
              data: {
                playbookId: created.id,
                phase: s.phase,
                sortOrder: s.sortOrder,
                slug: s.slug,
                title: s.title,
                description: s.description,
                ticketTypeSlug: s.ticketTypeSlug,
                defaultAssignedTeam: s.defaultAssignedTeam,
                defaultAssignedUserId: s.defaultAssignedUserId,
                defaultPriority: s.defaultPriority,
                dueDateOffsetDays: s.dueDateOffsetDays,
                defaultApplies: s.defaultApplies,
              },
            });
          }
        }
      }

      if (body.isDefault) {
        await tx.onboardingPlaybook.updateMany({
          where: { tenantId: ctx.tenantId, isDefault: true, NOT: { id: created.id } },
          data: { isDefault: false },
        });
      }
      return created;
    });

    return NextResponse.json({ success: true, data: playbook });
  } catch (error) {
    console.error("[onboarding] create playbook failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create playbook" },
      { status: 500 },
    );
  }
}
