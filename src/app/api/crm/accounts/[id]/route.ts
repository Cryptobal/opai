/**
 * API Route: /api/crm/accounts/[id]
 * GET   - Obtener cuenta
 * PATCH - Actualizar cuenta
 * DELETE - Eliminar cuenta
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { createAccountSchema } from "@/lib/validations/crm";

const OWNER_OVERRIDE_EMAILS = new Set(["carlos.irigoyen@gard.cl", "carlos@gard.cl"]);

function normalizeIdentity(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const account = await prisma.crmAccount.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        _count: { select: { contacts: true, deals: true, installations: true } },
      },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: account });
  } catch (error) {
    console.error("Error fetching account:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch account" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const existing = await prisma.crmAccount.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    const parsed = await parseBody(request, createAccountSchema.partial());
    if (parsed.error) return parsed.error;

    const requestingDowngradeToProspect =
      existing.type === "client" && parsed.data.type === "prospect";
    const nextType = parsed.data.type ?? existing.type;

    if (nextType === "prospect" && parsed.data.isActive === true) {
      throw new Error("PROSPECT_CANNOT_BE_ACTIVE");
    }

    const updateData: Record<string, unknown> = {
      ...parsed.data,
      ...(parsed.data.isActive === true ? { status: "active" } : {}),
      ...(parsed.data.isActive === false ? { status: "inactive" } : {}),
    };

    if (parsed.data.type === "prospect") {
      // Prospectos siempre quedan inactivos en operación.
      updateData.isActive = false;
      updateData.status = "inactive";
    }

    const account = await prisma.$transaction(async (tx) => {
      if (requestingDowngradeToProspect) {
        const admin = await tx.admin.findUnique({
          where: { id: ctx.userId },
          select: { role: true, email: true, name: true },
        });

        const normalizedEmail = normalizeIdentity(admin?.email || ctx.userEmail);
        const normalizedName = normalizeIdentity(admin?.name);
        const canDowngrade =
          admin?.role === "owner" &&
          (OWNER_OVERRIDE_EMAILS.has(normalizedEmail) || normalizedName === "carlos irigoyen");

        if (!canDowngrade) {
          throw new Error("FORBIDDEN_CLIENT_TO_PROSPECT");
        }
      }

      const updatedAccount = await tx.crmAccount.update({
        where: { id },
        data: updateData,
      });

      // Invariant: no inactive account can have active installations.
      if (parsed.data.isActive === false || parsed.data.type === "prospect") {
        await tx.crmInstallation.updateMany({
          where: { tenantId: ctx.tenantId, accountId: id, isActive: true },
          data: { isActive: false },
        });
      }

      return updatedAccount;
    });

    return NextResponse.json({ success: true, data: account });
  } catch (error) {
    if (error instanceof Error && error.message === "PROSPECT_CANNOT_BE_ACTIVE") {
      return NextResponse.json(
        {
          success: false,
          error: "Un prospecto no puede quedar activo. Conviértelo primero a cliente.",
        },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message === "FORBIDDEN_CLIENT_TO_PROSPECT") {
      return NextResponse.json(
        {
          success: false,
          error: "Solo Carlos Irigoyen (owner) puede revertir una cuenta cliente a prospecto.",
        },
        { status: 403 }
      );
    }
    console.error("Error updating account:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update account" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const existing = await prisma.crmAccount.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    await prisma.crmAccount.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
