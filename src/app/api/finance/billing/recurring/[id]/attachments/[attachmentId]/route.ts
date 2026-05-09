import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { deleteFile } from "@/lib/storage";

type Params = { id: string; attachmentId: string };

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (
      !hasFacturacionCapability(perms, "facturacion_create_draft") &&
      !hasFacturacionCapability(perms, "facturacion_issue") &&
      !hasFacturacionCapability(perms, "facturacion_configure")
    ) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { id, attachmentId } = await params;
    const attachment = await prisma.financeDteRecurringTemplateAttachment.findFirst({
      where: { id: attachmentId, templateId: id, tenantId: ctx.tenantId },
    });
    if (!attachment) {
      return NextResponse.json(
        { success: false, error: "Adjunto no encontrado" },
        { status: 404 },
      );
    }

    try {
      await deleteFile(attachment.storageKey);
    } catch (err) {
      console.error("[finance/dte-recurring/attachments] R2 delete failed", err);
    }
    await prisma.financeDteRecurringTemplateAttachment.delete({
      where: { id: attachmentId },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[finance/dte-recurring/attachments] delete error", err);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el adjunto" },
      { status: 500 },
    );
  }
}
