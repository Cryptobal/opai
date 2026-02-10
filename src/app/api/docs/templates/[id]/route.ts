/**
 * API Route: /api/docs/templates/[id]
 * GET    - Obtener template por ID
 * PATCH  - Actualizar template
 * DELETE - Desactivar template
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { updateDocTemplateSchema } from "@/lib/validations/docs";
import { extractTokenKeys } from "@/lib/docs/token-resolver";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const template = await prisma.docTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 10,
        },
        _count: {
          select: { documents: true, versions: true },
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error("Error fetching doc template:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener template" },
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
    const parsed = await parseBody(request, updateDocTemplateSchema);
    if (parsed.error) return parsed.error;

    const existing = await prisma.docTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Template no encontrado" },
        { status: 404 }
      );
    }

    const { changeNote, ...updateData } = parsed.data;
    if (updateData.usageSlug === undefined) delete updateData.usageSlug;

    // If content changed, auto-extract tokens and create new version
    if (updateData.content) {
      updateData.tokensUsed = extractTokenKeys(updateData.content);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // If setting as default, unset others
      if (updateData.isDefault) {
        await tx.docTemplate.updateMany({
          where: {
            tenantId: ctx.tenantId,
            module: updateData.module || existing.module,
            category: updateData.category || existing.category,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }

      const result = await tx.docTemplate.update({
        where: { id },
        data: updateData as any,
        include: {
          _count: {
            select: { documents: true, versions: true },
          },
        },
      });

      // Create version if content changed
      if (updateData.content) {
        const lastVersion = await tx.docTemplateVersion.findFirst({
          where: { templateId: id },
          orderBy: { version: "desc" },
        });

        await tx.docTemplateVersion.create({
          data: {
            templateId: id,
            version: (lastVersion?.version ?? 0) + 1,
            content: updateData.content,
            changeNote: changeNote || null,
            createdBy: ctx.userId,
          },
        });
      }

      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating doc template:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar template" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const template = await prisma.docTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template no encontrado" },
        { status: 404 }
      );
    }

    // Soft delete: just deactivate
    await prisma.docTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting doc template:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar template" },
      { status: 500 }
    );
  }
}
