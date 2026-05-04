/**
 * GET   /api/onboarding/playbooks/[id]  → detalle del playbook con steps
 * PATCH /api/onboarding/playbooks/[id]  → editar nombre, isActive, isDefault
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { playbookPatchSchema } from "@/lib/validations/onboarding";

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
    const playbook = await prisma.onboardingPlaybook.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        steps: {
          orderBy: [{ phase: "asc" }, { sortOrder: "asc" }],
        },
      },
    });
    if (!playbook) {
      return NextResponse.json(
        { success: false, error: "Playbook no encontrado" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: playbook });
  } catch (error) {
    console.error("[onboarding] get playbook failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get playbook" },
      { status: 500 },
    );
  }
}

export async function PATCH(
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
    const parsed = await parseBody(request, playbookPatchSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const existing = await prisma.onboardingPlaybook.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Playbook no encontrado" },
        { status: 404 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await tx.onboardingPlaybook.updateMany({
          where: {
            tenantId: ctx.tenantId,
            isDefault: true,
            NOT: { id },
          },
          data: { isDefault: false },
        });
      }
      return tx.onboardingPlaybook.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description,
          isActive: body.isActive,
          isDefault: body.isDefault,
        },
      });
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[onboarding] patch playbook failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update playbook" },
      { status: 500 },
    );
  }
}
