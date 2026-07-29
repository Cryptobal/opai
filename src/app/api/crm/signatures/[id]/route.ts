/**
 * API Route: /api/crm/signatures/[id]
 * GET    - Obtener firma por ID
 * PATCH  - Actualizar firma (htmlContent derivado; propiedad verificada)
 * DELETE - Soft delete
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { resolveApiPerms, type AuthContext } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { parseSignatureData } from "@/modules/crm/email/signature-data";
import { renderSignatureHtml } from "@/modules/crm/email/signature-render";

async function assertCanMutateSignature(
  ctx: AuthContext,
  signature: { userId: string | null },
): Promise<NextResponse | null> {
  const isOwn = signature.userId === ctx.userId;
  if (isOwn) return null;
  const perms = await resolveApiPerms(ctx);
  if (canEdit(perms, "config")) return null;
  return NextResponse.json(
    { success: false, error: "Sin permisos para modificar esta firma" },
    { status: 403 },
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const mod = await requireCorreosAccess("view");
    if (!mod.authorized) return mod.response;
    const { ctx } = mod;
    const { id } = await params;

    const signature = await prisma.crmEmailSignature.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!signature) {
      return NextResponse.json(
        { success: false, error: "Firma no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: signature });
  } catch (error) {
    console.error("Error fetching signature:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch signature" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const mod = await requireCorreosAccess("edit");
    if (!mod.authorized) return mod.response;
    const { ctx } = mod;
    const { id } = await params;

    const existing = await prisma.crmEmailSignature.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Firma no encontrada" },
        { status: 404 },
      );
    }

    const forbidden = await assertCanMutateSignature(ctx, existing);
    if (forbidden) return forbidden;

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      isDefault?: unknown;
      scope?: unknown;
      data?: unknown;
    };

    let nextUserId = existing.userId;
    if (body.scope === "tenant" || body.scope === "user") {
      const scope = body.scope === "tenant" ? "tenant" : "user";
      if (scope === "tenant") {
        const perms = await resolveApiPerms(ctx);
        if (!canEdit(perms, "config")) {
          return NextResponse.json(
            { success: false, error: "Sin permisos para editar firmas de la empresa" },
            { status: 403 },
          );
        }
        nextUserId = null;
      } else {
        nextUserId = ctx.userId;
      }
    }

    const updateData: {
      name?: string;
      content?: ReturnType<typeof parseSignatureData>;
      htmlContent?: string;
      isDefault?: boolean;
      userId?: string | null;
    } = {};

    if (typeof body.name === "string" && body.name.trim()) {
      updateData.name = body.name.trim();
    }

    if (body.data !== undefined) {
      const data = parseSignatureData(body.data, process.env.R2_PUBLIC_URL);
      if (!data.fullName) {
        return NextResponse.json(
          { success: false, error: "El nombre completo es obligatorio" },
          { status: 400 },
        );
      }
      updateData.content = data;
      updateData.htmlContent = renderSignatureHtml(data);
    }

    if (body.isDefault !== undefined) {
      updateData.isDefault = Boolean(body.isDefault);
    }

    if (nextUserId !== existing.userId) {
      updateData.userId = nextUserId;
    }

    const targetUserId =
      updateData.userId !== undefined ? updateData.userId : existing.userId;

    if (updateData.isDefault === true && !existing.isDefault) {
      await prisma.crmEmailSignature.updateMany({
        where: {
          tenantId: ctx.tenantId,
          userId: targetUserId,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    // Al desmarcar isDefault, acotar al mismo userId del registro.
    if (updateData.isDefault === false && existing.isDefault) {
      // no-op beyond the update itself; scope already on the row
    }

    const updated = await prisma.crmEmailSignature.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "UPDATE",
      entity: "CrmEmailSignature",
      entityId: id,
      tenantId: ctx.tenantId,
      details: {
        signatureId: id,
        scope: updated.userId ? "user" : "tenant",
        isDefault: updated.isDefault,
      },
      request,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating signature:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update signature" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const mod = await requireCorreosAccess("edit");
    if (!mod.authorized) return mod.response;
    const { ctx } = mod;
    const { id } = await params;

    const existing = await prisma.crmEmailSignature.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Firma no encontrada" },
        { status: 404 },
      );
    }

    const forbidden = await assertCanMutateSignature(ctx, existing);
    if (forbidden) return forbidden;

    await prisma.crmEmailSignature.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    });

    await logAudit({
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "DELETE",
      entity: "CrmEmailSignature",
      entityId: id,
      tenantId: ctx.tenantId,
      details: {
        signatureId: id,
        scope: existing.userId ? "user" : "tenant",
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting signature:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete signature" },
      { status: 500 },
    );
  }
}
