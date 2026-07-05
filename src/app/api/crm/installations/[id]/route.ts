/**
 * API Route: /api/crm/installations/[id]
 * GET   - Obtener una instalación
 * PATCH - Actualizar instalación
 * DELETE - Eliminar instalación
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit, requireCrmDelete } from "@/lib/api-auth-crm";
import { updateInstallationSchema } from "@/lib/validations/crm";
import { toSentenceCase } from "@/lib/text-format";
import { computeChangedFields, createCrmHistoryLog } from "@/lib/crm-history";
import { shutdownInstallationOperations } from "@/lib/crm/installation-operational-shutdown";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "installations");
    if (forbidden) return forbidden;

    const { id } = await params;

    const installation = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        commune: true,
        lat: true,
        lng: true,
        status: true,
        geoRadiusM: true,
        teMontoClp: true,
        marcacionCode: true,
        pairingCode: true,
        notes: true,
        metadata: true,
        nocturnoEnabled: true,
        chatEnabled: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
        accountId: true,
        leadId: true,
        account: { select: { id: true, name: true, type: true, status: true, isActive: true } },
      },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: installation });
  } catch (error) {
    console.error("Error fetching installation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch installation" },
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

    const { id } = await params;

    const existing = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        commune: true,
        lat: true,
        lng: true,
        status: true,
        geoRadiusM: true,
        teMontoClp: true,
        notes: true,
        nocturnoEnabled: true,
        chatEnabled: true,
        startDate: true,
        endDate: true,
        accountId: true,
        account: { select: { id: true, isActive: true } },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const parsed = await parseBody(request, updateInstallationSchema);
    if (parsed.error) return parsed.error;
    const payload = parsed.data;
    const installationData: Record<string, unknown> = { ...payload };
    delete installationData.activateAccount;

    // Convert date strings to Date objects for Prisma
    if (installationData.startDate !== undefined) {
      installationData.startDate = installationData.startDate
        ? new Date(installationData.startDate as string)
        : null;
    }
    if (installationData.endDate !== undefined) {
      installationData.endDate = installationData.endDate
        ? new Date(installationData.endDate as string)
        : null;
    }

    // Map status to data (remove activateAccount from Prisma data)
    const { activateAccount: _activateAccount, ...prismaData } = installationData as Record<string, unknown> & { activateAccount?: boolean };
    let normalizedData =
      payload.name === undefined
        ? prismaData
        : { ...prismaData, name: toSentenceCase(payload.name) ?? payload.name };

    // Sincronizar nocturnoEnabled y chatEnabled con status
    const finalStatus = (payload.status ?? existing.status) as string;
    if (payload.status !== undefined && payload.status !== existing.status) {
      if (payload.status === "active") {
        normalizedData = { ...normalizedData, nocturnoEnabled: true, chatEnabled: true };
      } else {
        normalizedData = { ...normalizedData, nocturnoEnabled: false, chatEnabled: false };
      }
    } else if (finalStatus !== "active") {
      // Prospect/inactive: nunca permitir nocturno ni chat activos
      normalizedData = { ...normalizedData, nocturnoEnabled: false, chatEnabled: false };
    }

    const accountNeedsActivation =
      existing.accountId &&
      existing.account &&
      existing.account.isActive === false;

    if (
      payload.status === "active" &&
      accountNeedsActivation &&
      payload.activateAccount !== true
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "No puedes activar una instalación de una cuenta inactiva sin activar la cuenta",
        },
        { status: 400 }
      );
    }

    let installation = await prisma.$transaction(async (tx) => {
      if (
        payload.status === "active" &&
        payload.activateAccount === true &&
        accountNeedsActivation
      ) {
        await tx.crmAccount.updateMany({
          where: { id: existing.accountId!, tenantId: ctx.tenantId },
          data: { isActive: true, type: "client", status: "client_active" },
        });
      }

      const updResult = await tx.crmInstallation.updateMany({
        where: { id, tenantId: ctx.tenantId },
        data: normalizedData,
      });
      if (updResult.count === 0) {
        throw new Error("INSTALLATION_NOT_FOUND");
      }
      const updatedInstallation = await tx.crmInstallation.findFirst({
        where: { id, tenantId: ctx.tenantId },
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          commune: true,
          lat: true,
          lng: true,
          status: true,
          geoRadiusM: true,
          teMontoClp: true,
          notes: true,
          nocturnoEnabled: true,
          chatEnabled: true,
          createdAt: true,
          updatedAt: true,
          accountId: true,
          account: { select: { id: true, name: true, type: true, status: true, isActive: true } },
        },
      });
      if (!updatedInstallation) throw new Error("INSTALLATION_NOT_FOUND");

      return updatedInstallation;
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const chatShouldBeOff =
      installation.status !== "active" ||
      payload.chatEnabled === false ||
      (payload.status !== undefined && payload.status !== "active");

    // Instalación no operativa: apagar rondas, chat y puentes Slack.
    if (installation.status !== "active") {
      await shutdownInstallationOperations(ctx.tenantId, id);
    }

    // Auto-manage chat channels when chatEnabled changes (o al quedar inactiva)
    if (payload.chatEnabled !== undefined || chatShouldBeOff) {
      if (payload.chatEnabled && installation.status === "active") {
        const existingChannels = await prisma.chatChannel.findMany({
          where: { installationId: id },
        });
        const hasReportes = existingChannels.some((c: any) => c.subType === "reportes");

        // Reactivate existing reportes channel (interno is deprecated and stays deactivated if present)
        if (existingChannels.length > 0) {
          await prisma.chatChannel.updateMany({
            where: { installationId: id, tenantId: ctx.tenantId, subType: "reportes" },
            data: { isActive: true },
          });
        }

        // Create missing reportes channel
        if (!hasReportes) {
          await prisma.chatChannel.create({
            data: {
              tenantId: ctx.tenantId,
              installationId: id,
              subType: "reportes",
              name: `${installation.name} - Reportes`,
            },
          });
        }
      } else if (chatShouldBeOff) {
        await prisma.chatChannel.updateMany({
          where: { installationId: id, tenantId: ctx.tenantId },
          data: { isActive: false },
        });
      }
    }

    // Sync finance cost center when installation status changes
    if (payload.status !== undefined) {
      const isActive = installation.status === "active";
      const existingCC = await prisma.financeCostCenter.findFirst({
        where: { tenantId: ctx.tenantId, installationId: id },
      });
      if (existingCC) {
        await prisma.financeCostCenter.update({
          where: { id: existingCC.id },
          data: { active: isActive, name: installation.name },
        });
      } else if (isActive) {
        await prisma.financeCostCenter.create({
          data: {
            tenantId: ctx.tenantId,
            name: installation.name,
            installationId: id,
            accountId: installation.accountId ?? null,
            active: true,
          },
        });
      }
    } else if (payload.name !== undefined) {
      // Sync name change to linked cost center
      await prisma.financeCostCenter.updateMany({
        where: { tenantId: ctx.tenantId, installationId: id },
        data: { name: installation.name },
      });
    }

    revalidatePath(`/crm/installations`);
    revalidatePath(`/crm/installations/${id}`);
    if (installation.accountId) {
      revalidatePath(`/crm/accounts/${installation.accountId}`);
    }
    if (payload.nocturnoEnabled !== undefined) {
      revalidatePath(`/ops/rondas/monitoreo`);
    }
    const diff = computeChangedFields(
      existing as unknown as Record<string, unknown>,
      normalizedData
    );
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "installation",
      entityId: id,
      action: "installation_updated",
      details: {
        changedFields: diff.changedFields,
        changes: diff.changes,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, data: installation });
  } catch (error) {
    if (error instanceof Error && error.message === "INSTALLATION_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }
    if (error instanceof Error && error.message === "ACCOUNT_INACTIVE") {
      return NextResponse.json(
        {
          success: false,
          error: "No puedes activar una instalación de una cuenta inactiva sin activar la cuenta",
        },
        { status: 400 }
      );
    }
    console.error("Error updating installation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update installation" },
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
    const forbidden = await requireCrmDelete(ctx, "installations");
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, name: true, accountId: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    await prisma.crmInstallation.delete({ where: { id } });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "installation",
      entityId: id,
      action: "installation_deleted",
      details: {
        name: existing.name,
        accountId: existing.accountId,
        status: existing.status,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting installation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete installation" },
      { status: 500 }
    );
  }
}
