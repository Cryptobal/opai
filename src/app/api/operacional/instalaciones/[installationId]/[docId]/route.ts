import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly } from "@/lib/ops";
import { deleteFile } from "@/lib/storage";
import { calcDocStatus } from "@/lib/docs-operacionales";

export async function PUT(
  request: NextRequest,
  { params }: { params: { installationId: string; docId: string } }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { docId } = params;
    const doc = await prisma.docOperacional.findFirst({
      where: { id: docId, tenantId: ctx.tenantId, capa: "instalacion" },
      include: { tipo: true },
    });
    if (!doc) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const issuedAt = body.issuedAt ? parseDateOnly(body.issuedAt) : undefined;
    const expiresAt = body.expiresAt !== undefined
      ? (body.expiresAt ? parseDateOnly(body.expiresAt) : null)
      : undefined;

    const newExpiresAt = expiresAt !== undefined ? expiresAt : doc.expiresAt;
    const status = calcDocStatus(newExpiresAt, doc.tipo.tieneVencimiento, doc.tipo.diasAlerta);

    const updated = await prisma.docOperacional.update({
      where: { id: docId },
      data: {
        ...(issuedAt !== undefined && { issuedAt }),
        ...(expiresAt !== undefined && { expiresAt }),
        ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
        ...(body.portalClienteVisible !== undefined && { portalClienteVisible: body.portalClienteVisible }),
        status,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        issuedAt: updated.issuedAt?.toISOString().slice(0, 10) ?? null,
        expiresAt: updated.expiresAt?.toISOString().slice(0, 10) ?? null,
        status: updated.status,
        notes: updated.notes,
        portalClienteVisible: updated.portalClienteVisible,
      },
    });
  } catch (error) {
    console.error("[DOCS-OP-INST] Error updating:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { installationId: string; docId: string } }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { docId } = params;
    const doc = await prisma.docOperacional.findFirst({
      where: { id: docId, tenantId: ctx.tenantId, capa: "instalacion" },
    });
    if (!doc) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    try {
      await deleteFile(doc.storageKey);
    } catch (e) {
      console.error("[DOCS-OP-INST] Error deleting file from R2:", e);
    }

    await prisma.docOperacional.delete({ where: { id: docId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DOCS-OP-INST] Error deleting:", error);
    return NextResponse.json({ success: false, error: "Error al eliminar" }, { status: 500 });
  }
}
