import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { deleteFile } from "@/lib/storage";

type Params = { id: string; attachmentId: string };

// ── DELETE: remove user attachment from a DTE ──
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
      !hasFacturacionCapability(perms, "facturacion_issue")
    ) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { id, attachmentId } = await params;

    const attachment = await prisma.financeDteAttachment.findFirst({
      where: {
        id: attachmentId,
        dteId: id,
        tenantId: ctx.tenantId,
        kind: "USER_UPLOAD",
      },
    });
    if (!attachment) {
      return NextResponse.json(
        { success: false, error: "Adjunto no encontrado" },
        { status: 404 },
      );
    }

    if (attachment.storageKey) {
      try {
        await deleteFile(attachment.storageKey);
      } catch (err) {
        console.error("[finance/dte/attachments] R2 delete failed", err);
        // Continúa con borrado en BD aunque R2 falle.
      }
    }
    await prisma.financeDteAttachment.delete({ where: { id: attachmentId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[finance/dte/attachments] delete error", err);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el adjunto" },
      { status: 500 },
    );
  }
}
