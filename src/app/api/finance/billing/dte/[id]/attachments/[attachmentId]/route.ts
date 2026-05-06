/**
 * API: /api/finance/billing/dte/[id]/attachments/[attachmentId]
 *
 *  GET    → descarga el archivo (binario) con headers Content-Disposition.
 *  DELETE → elimina el adjunto.
 *
 * La autorización se basa en tenantId del DTE (debe coincidir con el
 * tenant del usuario).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "facturacion")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const { id, attachmentId } = await params;
  const att = await prisma.financeDteAttachment.findFirst({
    where: {
      id: attachmentId,
      dteId: id,
      tenantId: ctx.tenantId,
    },
  });
  if (!att) {
    return NextResponse.json(
      { success: false, error: "Adjunto no encontrado" },
      { status: 404 },
    );
  }

  // Encode filename para Content-Disposition (RFC 5987 para caracteres no-ASCII).
  const safeFilename = att.filename.replace(/[^\w.\-]/g, "_");
  const utf8Filename = encodeURIComponent(att.filename);

  return new NextResponse(new Uint8Array(att.data), {
    status: 200,
    headers: {
      "Content-Type": att.mimeType,
      "Content-Length": String(att.size),
      "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${utf8Filename}`,
      "Cache-Control": "private, no-cache",
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "facturacion_manage")) {
    return NextResponse.json(
      { success: false, error: "Sin permiso para eliminar adjuntos" },
      { status: 403 },
    );
  }

  const { id, attachmentId } = await params;
  const att = await prisma.financeDteAttachment.findFirst({
    where: { id: attachmentId, dteId: id, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!att) {
    return NextResponse.json(
      { success: false, error: "Adjunto no encontrado" },
      { status: 404 },
    );
  }

  await prisma.financeDteAttachment.delete({
    where: { id: attachmentId },
  });

  return NextResponse.json({ success: true });
}
