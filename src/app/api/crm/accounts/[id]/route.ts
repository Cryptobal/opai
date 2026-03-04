/**
 * API Route: /api/crm/accounts/[id]
 * GET   - Obtener cuenta
 * PATCH - Actualizar cuenta
 * DELETE - Eliminar cuenta
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { createAccountSchema, updateAccountSchema } from "@/lib/validations/crm";
import { computeChangedFields, createCrmHistoryLog } from "@/lib/crm-history";

const OWNER_OVERRIDE_EMAILS = new Set(["carlos.irigoyen@gard.cl", "carlos@gard.cl"]);
type AccountLifecycle = "prospect" | "client_active" | "client_inactive";

function normalizeIdentity(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function normalizeLifecycle(input?: string | null): AccountLifecycle | null {
  if (input === "prospect" || input === "client_active" || input === "client_inactive") {
    return input;
  }
  return null;
}

function deriveLifecycle(account: { status?: string | null; type?: string | null; isActive?: boolean | null }): AccountLifecycle {
  const fromStatus = normalizeLifecycle(account.status);
  if (fromStatus) return fromStatus;
  if (account.type === "prospect") return "prospect";
  return account.isActive ? "client_active" : "client_inactive";
}

function lifecycleToLegacyFields(lifecycle: AccountLifecycle) {
  if (lifecycle === "prospect") {
    return { type: "prospect" as const, isActive: false, status: "prospect" };
  }
  if (lifecycle === "client_inactive") {
    return { type: "client" as const, isActive: false, status: "client_inactive" };
  }
  return { type: "client" as const, isActive: true, status: "client_active" };
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

    const parsed = await parseBody(request, updateAccountSchema);
    if (parsed.error) return parsed.error;

    const existingLifecycle = deriveLifecycle(existing);
    const requestingDowngradeToProspect =
      existingLifecycle !== "prospect" &&
      (parsed.data.status === "prospect" || parsed.data.type === "prospect");

    if ((parsed.data.status === "prospect" || parsed.data.type === "prospect") && parsed.data.isActive === true) {
      throw new Error("PROSPECT_CANNOT_BE_ACTIVE");
    }

    let nextLifecycle: AccountLifecycle = existingLifecycle;
    const normalizedStatus = normalizeLifecycle(parsed.data.status);
    if (normalizedStatus) {
      nextLifecycle = normalizedStatus;
    } else if (parsed.data.type === "prospect") {
      nextLifecycle = "prospect";
    } else if (parsed.data.type === "client") {
      if (existingLifecycle === "prospect") nextLifecycle = "client_inactive";
      else if (parsed.data.isActive === true) nextLifecycle = "client_active";
      else if (parsed.data.isActive === false) nextLifecycle = "client_inactive";
    } else if (parsed.data.isActive !== undefined) {
      if (existingLifecycle === "prospect" && parsed.data.isActive === true) {
        throw new Error("PROSPECT_CANNOT_BE_ACTIVE");
      }
      if (existingLifecycle !== "prospect") {
        nextLifecycle = parsed.data.isActive ? "client_active" : "client_inactive";
      }
    }

    const legacy = lifecycleToLegacyFields(nextLifecycle);
    const updateData: Record<string, unknown> = {
      ...parsed.data,
      type: legacy.type,
      isActive: legacy.isActive,
      status: legacy.status,
    };

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

      // Invariant: no account out of operation can keep active installations.
      if (legacy.isActive === false) {
        await tx.crmInstallation.updateMany({
          where: { tenantId: ctx.tenantId, accountId: id, isActive: true },
          data: { isActive: false },
        });
      }

      return updatedAccount;
    });
    const diff = computeChangedFields(
      existing as unknown as Record<string, unknown>,
      updateData
    );
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "account",
      entityId: id,
      action: "account_updated",
      details: {
        changedFields: diff.changedFields,
        changes: diff.changes,
      },
      createdBy: ctx.userId,
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
    const msg = error instanceof Error ? error.message : "Error al actualizar la cuenta";
    console.error("Error updating account:", error);
    return NextResponse.json(
      { success: false, error: msg },
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
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "account",
      entityId: id,
      action: "account_deleted",
      details: {
        name: existing.name,
        type: existing.type,
        status: existing.status,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
