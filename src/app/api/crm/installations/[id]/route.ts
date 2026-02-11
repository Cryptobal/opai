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
      include: { account: { select: { id: true, name: true } } },
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

    const normalizedData =
      payload.name === undefined
        ? payload
        : { ...payload, name: toSentenceCase(payload.name) ?? payload.name };

    const installation = await prisma.crmInstallation.update({
      where: { id },
      data: normalizedData,
      include: { account: { select: { id: true, name: true } } },
    });

    revalidatePath(`/crm/installations`);
    revalidatePath(`/crm/installations/${id}`);
    if (installation.accountId) {
      revalidatePath(`/crm/accounts/${installation.accountId}`);
    }

    return NextResponse.json({ success: true, data: installation });
  } catch (error) {
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
