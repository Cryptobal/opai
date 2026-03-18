/**
 * API Route: /api/crm/contacts/[id]
 * GET   - Obtener contacto
 * PATCH - Actualizar contacto
 * DELETE - Eliminar contacto
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit, requireCrmDelete } from "@/lib/api-auth-crm";
import { updateContactSchema } from "@/lib/validations/crm";
import { computeChangedFields, createCrmHistoryLog } from "@/lib/crm-history";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "contacts");
    if (forbidden) return forbidden;

    const { id } = await params;

    const contact = await prisma.crmContact.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { account: true },
    });

    if (!contact) {
      return NextResponse.json(
        { success: false, error: "Contacto no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: contact });
  } catch (error) {
    console.error("Error fetching contact:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch contact" },
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
    const forbidden = await requireCrmEdit(ctx, "contacts");
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.crmContact.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Contacto no encontrado" },
        { status: 404 }
      );
    }

    const parsed = await parseBody(request, updateContactSchema);
    if (parsed.error) return parsed.error;

    const result = await prisma.crmContact.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: parsed.data,
    });
    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Contacto no encontrado" },
        { status: 404 }
      );
    }
    const contact = await prisma.crmContact.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { account: true },
    });
    const diff = computeChangedFields(
      existing as unknown as Record<string, unknown>,
      parsed.data as unknown as Record<string, unknown>
    );
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "contact",
      entityId: id,
      action: "contact_updated",
      details: {
        changedFields: diff.changedFields,
        changes: diff.changes,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, data: contact });
  } catch (error) {
    console.error("Error updating contact:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update contact" },
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
    const forbidden = await requireCrmDelete(ctx, "contacts");
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.crmContact.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Contacto no encontrado" },
        { status: 404 }
      );
    }

    await prisma.crmContact.delete({ where: { id } });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "contact",
      entityId: id,
      action: "contact_deleted",
      details: {
        fullName: `${existing.firstName} ${existing.lastName}`.trim(),
        email: existing.email,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting contact:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete contact" },
      { status: 500 }
    );
  }
}
