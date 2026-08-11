import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { deleteFile } from "@/lib/storage";
import { calcDocStatus } from "@/lib/docs-operacionales";
import { parseDateOnly } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import {
  deleteOperacionalDoc,
  findOperacionalDoc,
  updateOperacionalDoc,
} from "@/lib/docs/operacional-docs-service";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const doc = await findOperacionalDoc(ctx.tenantId, id);
    if (!doc || doc.capa !== "global") {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const tipo = doc.tipoId
      ? await prisma.tipoDocumento.findFirst({ where: { id: doc.tipoId, tenantId: ctx.tenantId } })
      : null;
    if (!tipo) {
      return NextResponse.json({ success: false, error: "Tipo no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const issuedAt = body.issuedAt ? parseDateOnly(body.issuedAt) : undefined;
    const expiresAt = body.expiresAt !== undefined
      ? (body.expiresAt ? parseDateOnly(body.expiresAt) : null)
      : undefined;

    const newExpiresAt = expiresAt !== undefined ? expiresAt : doc.expiresAt;
    const status = calcDocStatus(newExpiresAt, tipo.tieneVencimiento, tipo.diasAlerta);

    const updated = await updateOperacionalDoc(ctx.tenantId, id, {
      ...(issuedAt !== undefined && { issuedAt }),
      ...(expiresAt !== undefined && { expiresAt }),
      ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
      ...(body.portalClienteVisible !== undefined && {
        portalClienteVisible: body.portalClienteVisible,
      }),
      status,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        issuedAt: updated.issuedAt?.toISOString().slice(0, 10) ?? null,
        expiresAt: updated.expiresAt?.toISOString().slice(0, 10) ?? null,
        status: updated.status,
        notes: updated.notes,
        portalClienteVisible:
          "portalClienteVisible" in updated
            ? updated.portalClienteVisible
            : updated.portalVisible,
      },
    });
  } catch (error) {
    console.error("[DOCS-GLOBALES] Error updating:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const doc = await findOperacionalDoc(ctx.tenantId, id);
    if (!doc || doc.capa !== "global") {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    if (doc.storageKey) {
      try {
        await deleteFile(doc.storageKey);
      } catch (e) {
        console.error("[DOCS-GLOBALES] Error deleting file from R2:", e);
      }
    }

    await deleteOperacionalDoc(ctx.tenantId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DOCS-GLOBALES] Error deleting:", error);
    return NextResponse.json({ success: false, error: "Error al eliminar" }, { status: 500 });
  }
}
