/**
 * API Route: /api/docs/documents
 * GET  - Listar documentos
 * POST - Crear documento (generar desde template o en blanco)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { createDocumentSchema } from "@/lib/validations/docs";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { searchParams } = new URL(request.url);
    const module = searchParams.get("module");
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    // Base filter
    const where: any = { tenantId: ctx.tenantId };
    if (module) where.module = module;
    if (status) where.status = status;
    if (category) where.category = category;

    // Filter by associated entity
    if (entityType && entityId) {
      where.associations = {
        some: { entityType, entityId },
      };
    }

    const [documentsRaw, counts] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          template: { select: { id: true, name: true, module: true, category: true } },
          associations: true,
        },
      }),
      prisma.document.groupBy({
        by: ["status"],
        where: { tenantId: ctx.tenantId, ...(module ? { module } : {}) },
        _count: { id: true },
      }),
    ]);

    // Enriquecer con nombre y RUT del guardia cuando hay asociación ops_guardia
    const guardiaIds = documentsRaw.flatMap((d) =>
      d.associations.filter((a) => a.entityType === "ops_guardia").map((a) => a.entityId)
    );
    const uniqueGuardiaIds = [...new Set(guardiaIds)];
    const guardias =
      uniqueGuardiaIds.length > 0
        ? await prisma.opsGuardia.findMany({
            where: { id: { in: uniqueGuardiaIds }, tenantId: ctx.tenantId },
            select: {
              id: true,
              persona: { select: { firstName: true, lastName: true, rut: true } },
            },
          })
        : [];
    const guardiaMap = Object.fromEntries(
      guardias.map((g) => [
        g.id,
        {
          fullName: `${g.persona.firstName} ${g.persona.lastName}`.trim(),
          rut: g.persona.rut,
        },
      ])
    );

    const documents = documentsRaw.map((d) => {
      const guardiaAssoc = d.associations.find((a) => a.entityType === "ops_guardia");
      const guardiaInfo = guardiaAssoc ? guardiaMap[guardiaAssoc.entityId] : null;
      return {
        ...d,
        guardiaName: guardiaInfo?.fullName ?? null,
        guardiaRut: guardiaInfo?.rut ?? null,
      };
    });

    // Build status counts
    const statusCounts: Record<string, number> = {};
    for (const c of counts) {
      statusCounts[c.status] = c._count.id;
    }

    return NextResponse.json({
      success: true,
      data: documents,
      meta: { statusCounts, total: documents.length },
    });
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener documentos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = await parseBody(request, createDocumentSchema);
    if (parsed.error) return parsed.error;

    const {
      templateId,
      title,
      content,
      tokenValues,
      module,
      category,
      effectiveDate,
      expirationDate,
      alertDaysBefore,
      associations,
    } = parsed.data;

    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          tenantId: ctx.tenantId,
          templateId,
          title,
          content,
          tokenValues: tokenValues || undefined,
          module,
          category,
          effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
          expirationDate: expirationDate ? new Date(expirationDate) : undefined,
          alertDaysBefore: alertDaysBefore ?? 30,
          createdBy: ctx.userId,
        },
      });

      // Create associations
      if (associations && associations.length > 0) {
        await tx.docAssociation.createMany({
          data: associations.map((a) => ({
            documentId: doc.id,
            entityType: a.entityType,
            entityId: a.entityId,
            role: a.role || "primary",
          })),
        });
      }

      // Create history entry
      await tx.docHistory.create({
        data: {
          documentId: doc.id,
          action: "created",
          details: {
            templateId,
            associationCount: associations?.length || 0,
          },
          createdBy: ctx.userId,
        },
      });

      return tx.document.findUnique({
        where: { id: doc.id },
        include: {
          template: { select: { id: true, name: true, module: true, category: true } },
          associations: true,
        },
      });
    });

    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (error) {
    console.error("Error creating document:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear documento" },
      { status: 500 }
    );
  }
}
