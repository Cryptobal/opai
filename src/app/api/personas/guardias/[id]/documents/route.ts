import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import {
  createGuardiaDocumentSchema,
  updateGuardiaDocumentSchema,
} from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsAccess, ensureOpsCapability, parseDateOnly } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import { normalizeNullable } from "@/lib/personas";
import {
  createPersonaDoc,
  deletePersonaDoc,
  getPersonaDoc,
  listPersonaDocs,
  updatePersonaDoc,
} from "@/lib/docs/persona-docs-service";

type Params = { id: string };

async function ensureGuardia(tenantId: string, guardiaId: string) {
  return prisma.opsGuardia.findFirst({
    where: { id: guardiaId, tenantId },
    select: { id: true },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsCapability(ctx, "guardias_documents");
    if (forbidden) return forbidden;
    const { id } = await params;

    const guardia = await ensureGuardia(ctx.tenantId, id);
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const needsAttentionOnly =
      request.nextUrl.searchParams.get("needsAttention") === "1";
    const docs = await listPersonaDocs(ctx.tenantId, id, { needsAttentionOnly });

    return NextResponse.json({ success: true, data: docs });
  } catch (error) {
    console.error("[PERSONAS] Error listing documents:", error);
    return NextResponse.json({ success: false, error: "No se pudieron obtener los documentos" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsCapability(ctx, "guardias_documents");
    if (forbidden) return forbidden;
    const { id } = await params;

    const guardia = await ensureGuardia(ctx.tenantId, id);
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const parsed = await parseBody(request, createGuardiaDocumentSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const created = await createPersonaDoc(ctx.tenantId, {
      guardiaId: id,
      type: body.type,
      fileUrl: body.fileUrl,
      fileName: normalizeNullable(body.fileName),
      mimeType: normalizeNullable(body.mimeType),
      size: body.size ?? null,
      status: body.status,
      issuedAt: body.issuedAt ? parseDateOnly(body.issuedAt) : null,
      expiresAt: body.expiresAt ? parseDateOnly(body.expiresAt) : null,
      notes: normalizeNullable(body.notes),
      folderId: body.folderId || null,
      portalVisible: body.portalVisible ?? false,
    });

    await prisma.opsGuardiaHistory.create({
      data: {
        tenantId: ctx.tenantId,
        guardiaId: id,
        eventType: "document_uploaded",
        newValue: {
          type: created.type,
          status: created.status,
          expiresAt: created.expiresAt,
        },
        createdBy: ctx.userId,
      },
    });

    await createOpsAuditLog(ctx, "personas.guardia.document.created", "ops_guardia", id, {
      documentId: created.id,
      type: created.type,
    });

    void import("@/lib/google-workspace/drive-enqueue-hooks").then(
      ({ enqueueDocumentoPersonaToDrive }) =>
        enqueueDocumentoPersonaToDrive({
          tenantId: ctx.tenantId,
          guardiaId: id,
          documentoId: created.id,
        }),
    );

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[PERSONAS] Error creating document:", error);
    return NextResponse.json({ success: false, error: "No se pudo crear el documento" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsCapability(ctx, "guardias_documents");
    if (forbidden) return forbidden;
    const { id } = await params;
    const documentId = request.nextUrl.searchParams.get("documentId");
    if (!documentId) {
      return NextResponse.json({ success: false, error: "documentId es requerido" }, { status: 400 });
    }

    const existing = await getPersonaDoc(ctx.tenantId, id, documentId);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const parsed = await parseBody(request, updateGuardiaDocumentSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const patch: Record<string, unknown> = {};
    if (body.type !== undefined) patch.type = body.type;
    if (body.fileUrl !== undefined) patch.fileUrl = body.fileUrl;
    if (body.status !== undefined) {
      patch.status = body.status;
      if (body.status !== "pendiente") {
        patch.validatedBy = ctx.userId;
        patch.validatedAt = new Date();
      }
    }
    if (body.issuedAt !== undefined) {
      patch.issuedAt = body.issuedAt ? parseDateOnly(body.issuedAt) : null;
    }
    if (body.expiresAt !== undefined) {
      patch.expiresAt = body.expiresAt ? parseDateOnly(body.expiresAt) : null;
    }
    if (body.notes !== undefined) patch.notes = normalizeNullable(body.notes);
    if (body.folderId !== undefined) patch.folderId = body.folderId || null;
    if (body.portalVisible !== undefined) patch.portalVisible = body.portalVisible;

    const updated = await updatePersonaDoc(ctx.tenantId, id, documentId, patch);

    await prisma.opsGuardiaHistory.create({
      data: {
        tenantId: ctx.tenantId,
        guardiaId: id,
        eventType: "document_updated",
        previousValue: { type: existing.type, status: existing.status },
        newValue: { type: updated?.type, status: updated?.status },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PERSONAS] Error updating document:", error);
    return NextResponse.json({ success: false, error: "No se pudo actualizar el documento" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;
    const { id } = await params;
    const documentId = request.nextUrl.searchParams.get("documentId");
    if (!documentId) {
      return NextResponse.json({ success: false, error: "documentId es requerido" }, { status: 400 });
    }

    const existing = await getPersonaDoc(ctx.tenantId, id, documentId);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const deleted = await deletePersonaDoc(ctx.tenantId, id, documentId);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }
    await prisma.opsGuardiaHistory.create({
      data: {
        tenantId: ctx.tenantId,
        guardiaId: id,
        eventType: "document_deleted",
        previousValue: { type: existing.type, status: existing.status },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PERSONAS] Error deleting document:", error);
    return NextResponse.json({ success: false, error: "No se pudo eliminar el documento" }, { status: 500 });
  }
}
