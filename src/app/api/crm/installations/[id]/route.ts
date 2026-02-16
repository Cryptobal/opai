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
import { updateInstallationSchema } from "@/lib/validations/crm";
import { toSentenceCase } from "@/lib/text-format";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

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
        isActive: true,
        geoRadiusM: true,
        teMontoClp: true,
        marcacionCode: true,
        notes: true,
        metadata: true,
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
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const existing = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
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

    const normalizedData =
      payload.name === undefined
        ? installationData
        : { ...installationData, name: toSentenceCase(payload.name) ?? payload.name };
    const installation = await prisma.$transaction(async (tx) => {
      const updatedInstallation = await tx.crmInstallation.update({
        where: { id },
        data: normalizedData,
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          commune: true,
          lat: true,
          lng: true,
          isActive: true,
          geoRadiusM: true,
          teMontoClp: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          accountId: true,
          account: { select: { id: true, name: true, type: true, status: true, isActive: true } },
        },
      });

      const accountNeedsActivation =
        updatedInstallation.account &&
        (updatedInstallation.account.isActive === false ||
          updatedInstallation.account.type === "prospect");

      if (
        payload.isActive === true &&
        payload.activateAccount === true &&
        updatedInstallation.accountId &&
        accountNeedsActivation
      ) {
        await tx.crmAccount.update({
          where: { id: updatedInstallation.accountId },
          data: { isActive: true, type: "client", status: "client_active" },
        });
        return {
          ...updatedInstallation,
          account: updatedInstallation.account
            ? { ...updatedInstallation.account, isActive: true, type: "client" as const }
            : updatedInstallation.account,
        };
      }

      if (
        payload.isActive === true &&
        updatedInstallation.accountId &&
        accountNeedsActivation &&
        payload.activateAccount !== true
      ) {
        throw new Error("ACCOUNT_INACTIVE");
      }

      return updatedInstallation;
    });

    revalidatePath(`/crm/installations`);
    revalidatePath(`/crm/installations/${id}`);
    if (installation.accountId) {
      revalidatePath(`/crm/accounts/${installation.accountId}`);
    }

    return NextResponse.json({ success: true, data: installation });
  } catch (error) {
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
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const existing = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    await prisma.crmInstallation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting installation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete installation" },
      { status: 500 }
    );
  }
}
