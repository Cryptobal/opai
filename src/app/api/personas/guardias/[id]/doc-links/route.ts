import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ensureOpsAccess, ensureOpsCapability } from "@/lib/ops";
import { z } from "zod";

type Params = { id: string };

const createDocLinkSchema = z.object({
  documentId: z.string().uuid("documentId inválido"),
  role: z.enum(["primary", "related", "copy"]).default("related"),
});

async function ensureGuardia(tenantId: string, guardiaId: string) {
  return prisma.opsGuardia.findFirst({
    where: { id: guardiaId, tenantId },
    select: { id: true },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const guardia = await ensureGuardia(ctx.tenantId, id);
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    const linkedAssociations = await prisma.docAssociation.findMany({
      where: {
        entityType: "ops_guardia",
        entityId: id,
        document: { tenantId: ctx.tenantId },
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            module: true,
            category: true,
            status: true,
            signatureStatus: true,
            createdAt: true,
            expirationDate: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const linkedIds = linkedAssociations.map((item) => item.documentId);
    const availableDocuments = await prisma.document.findMany({
      where: {
        tenantId: ctx.tenantId,
        module: "legal",
        ...(linkedIds.length > 0 ? { id: { notIn: linkedIds } } : {}),
      },
      select: {
        id: true,
        title: true,
        module: true,
        category: true,
        status: true,
        createdAt: true,
        expirationDate: true,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 40,
    });

    return NextResponse.json({
      success: true,
      data: {
        linked: linkedAssociations.map((item) => ({
          id: item.id,
          role: item.role,
          createdAt: item.createdAt,
          document: item.document,
        })),
        available: availableDocuments,
      },
    });
  } catch (error) {
    console.error("[PERSONAS] Error listing guardia doc links:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los vínculos de documentos" },
      { status: 500 }
    );
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

    const parsed = await parseBody(request, createDocLinkSchema);
    if (parsed.error) return parsed.error;

    const document = await prisma.document.findFirst({
      where: { id: parsed.data.documentId, tenantId: ctx.tenantId },
      select: { id: true, title: true },
    });
    if (!document) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const linked = await prisma.docAssociation.upsert({
      where: {
        documentId_entityType_entityId: {
          documentId: parsed.data.documentId,
          entityType: "ops_guardia",
          entityId: id,
        },
      },
      create: {
        documentId: parsed.data.documentId,
        entityType: "ops_guardia",
        entityId: id,
        role: parsed.data.role,
      },
      update: { role: parsed.data.role },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            module: true,
            category: true,
            status: true,
            signatureStatus: true,
            createdAt: true,
            expirationDate: true,
          },
        },
      },
    });

    await prisma.opsGuardiaHistory.create({
      data: {
        tenantId: ctx.tenantId,
        guardiaId: id,
        eventType: "document_linked",
        newValue: {
          documentId: parsed.data.documentId,
          role: parsed.data.role,
          title: document.title,
        },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: linked }, { status: 201 });
  } catch (error) {
    console.error("[PERSONAS] Error linking guardia document:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo vincular el documento" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const documentId = request.nextUrl.searchParams.get("documentId");
    if (!documentId) {
      return NextResponse.json({ success: false, error: "documentId es requerido" }, { status: 400 });
    }

    const doc = await prisma.document.findFirst({
      where: { id: documentId, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!doc) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const assocDeleted = await prisma.docAssociation.deleteMany({
      where: {
        documentId,
        entityType: "ops_guardia",
        entityId: id,
      },
    });

    if (assocDeleted.count === 0) {
      return NextResponse.json({ success: false, error: "Vínculo no encontrado" }, { status: 404 });
    }

    // Si es borrador y no tiene otras asociaciones, eliminar el documento para no acumular borradores
    if (doc.status === "draft") {
      const otherAssocs = await prisma.docAssociation.count({
        where: { documentId },
      });
      if (otherAssocs === 0) {
        await prisma.document.delete({ where: { id: documentId } });
      }
    }

    await prisma.opsGuardiaHistory.create({
      data: {
        tenantId: ctx.tenantId,
        guardiaId: id,
        eventType: "document_unlinked",
        newValue: { documentId },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PERSONAS] Error unlinking guardia document:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo desvincular el documento" },
      { status: 500 }
    );
  }
}
