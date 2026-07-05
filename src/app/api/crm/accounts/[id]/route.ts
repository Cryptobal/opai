/**
 * API Route: /api/crm/accounts/[id]
 * GET   - Obtener cuenta
 * PATCH - Actualizar cuenta
 * DELETE - Eliminar cuenta
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit, requireCrmDelete } from "@/lib/api-auth-crm";
import { createAccountSchema, updateAccountSchema } from "@/lib/validations/crm";
import { computeChangedFields, createCrmHistoryLog } from "@/lib/crm-history";
import { shutdownInstallationOperations } from "@/lib/crm/installation-operational-shutdown";
import { requireTenantModule } from '@/lib/require-module';

type AccountLifecycle = "prospect" | "client_active" | "client_inactive";

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
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "accounts");
    if (forbidden) return forbidden;

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
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "accounts");
    if (forbidden) return forbidden;

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

    let deactivatedInstallationIds: string[] = [];

    const account = await prisma.$transaction(async (tx) => {
      if (requestingDowngradeToProspect) {
        const admin = await tx.admin.findUnique({
          where: { id: ctx.userId },
          select: { role: true, email: true, name: true },
        });

        const canDowngrade = admin?.role === "owner";

        if (!canDowngrade) {
          throw new Error("FORBIDDEN_CLIENT_TO_PROSPECT");
        }
      }

      const updatedAccount = await tx.crmAccount.update({
        where: { id },
        data: updateData,
      });

      // Mirror sync: flat representante / personería columns ↔ relation tables.
      // Portal (AccountRepresentanteLegal / AccountPersoneria) is the canonical
      // UI for these, but ERP edits the flat columns directly. Keep them in sync
      // so the portal reflects ERP edits (and tokens resolve from either source).
      const repNameChanged =
        parsed.data.legalRepresentativeName !== undefined &&
        parsed.data.legalRepresentativeName !== existing.legalRepresentativeName;
      const repRutChanged =
        parsed.data.legalRepresentativeRut !== undefined &&
        parsed.data.legalRepresentativeRut !== existing.legalRepresentativeRut;
      if (repNameChanged || repRutChanged) {
        const nextName = (parsed.data.legalRepresentativeName ?? existing.legalRepresentativeName ?? "").trim();
        const nextRut = (parsed.data.legalRepresentativeRut ?? existing.legalRepresentativeRut ?? "").trim();
        if (nextName && nextRut) {
          const firstRep = await tx.accountRepresentanteLegal.findFirst({
            where: { accountId: id },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          });
          if (firstRep) {
            await tx.accountRepresentanteLegal.update({
              where: { id: firstRep.id },
              data: { nombre: nextName, rut: nextRut },
            });
          } else {
            await tx.accountRepresentanteLegal.create({
              data: {
                tenantId: ctx.tenantId,
                accountId: id,
                nombre: nextName,
                rut: nextRut,
              },
            });
          }
        }
      }

      const notaryNameChanged =
        parsed.data.notaryName !== undefined &&
        parsed.data.notaryName !== existing.notaryName;
      const notaryDateChanged =
        parsed.data.notaryDate !== undefined &&
        parsed.data.notaryDate !== existing.notaryDate;
      if (notaryNameChanged || notaryDateChanged) {
        const nextNotaria = parsed.data.notaryName ?? existing.notaryName ?? null;
        const nextDateStr = parsed.data.notaryDate ?? existing.notaryDate ?? null;
        const nextDate = nextDateStr ? new Date(nextDateStr) : null;
        await tx.accountPersoneria.upsert({
          where: { accountId: id },
          create: {
            tenantId: ctx.tenantId,
            accountId: id,
            notaria: nextNotaria,
            fechaEscritura: nextDate && !isNaN(nextDate.getTime()) ? nextDate : null,
          },
          update: {
            notaria: nextNotaria,
            fechaEscritura: nextDate && !isNaN(nextDate.getTime()) ? nextDate : null,
          },
        });
      }

      // Invariant: no account out of operation can keep active installations.
      if (legacy.isActive === false) {
        const toDeactivate = await tx.crmInstallation.findMany({
          where: { tenantId: ctx.tenantId, accountId: id, status: "active" },
          select: { id: true },
        });
        deactivatedInstallationIds = toDeactivate.map((i) => i.id);
        if (deactivatedInstallationIds.length > 0) {
          await tx.crmInstallation.updateMany({
            where: { id: { in: deactivatedInstallationIds }, tenantId: ctx.tenantId },
            data: { status: "inactive", nocturnoEnabled: false, chatEnabled: false },
          });
        }
      }

      return updatedAccount;
    });

    for (const installationId of deactivatedInstallationIds) {
      await shutdownInstallationOperations(ctx.tenantId, installationId);
    }
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
          error: "Solo un owner puede revertir una cuenta cliente a prospecto.",
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
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmDelete(ctx, "accounts");
    if (forbidden) return forbidden;

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
