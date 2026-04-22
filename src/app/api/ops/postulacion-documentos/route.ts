/**
 * API: /api/ops/postulacion-documentos
 * GET  - Lista de documentos de postulación (configuración)
 * POST - Guardar lista (code, label, required por documento)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, resolveApiPerms, unauthorized } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  getEffectivePostulacionDocuments,
  getPostulacionDocumentTypes,
  getStoredPostulacionDocumentTypesRaw,
  setPostulacionDocumentTypes,
  validatePostulacionDocumentRemoval,
  type PostulacionDocumentItem,
} from "@/lib/postulacion-documentos";
import { z } from "zod";

const postBodySchema = z.object({
  documents: z.array(
    z.object({
      code: z.string().min(1).max(80),
      label: z.string().min(1).max(120),
      required: z.boolean(),
    })
  ),
});

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "config", "ops")) {
      return NextResponse.json({ success: false, error: "Sin permiso" }, { status: 403 });
    }
    const documents = await getPostulacionDocumentTypes(ctx.tenantId);
    const counts = await prisma.opsDocumentoPersona.groupBy({
      by: ["type"],
      where: { tenantId: ctx.tenantId },
      _count: { _all: true },
    });
    const documentCountsByType: Record<string, number> = {};
    for (const row of counts) {
      documentCountsByType[row.type] = row._count._all;
    }
    return NextResponse.json({ success: true, data: documents, documentCountsByType });
  } catch (error) {
    console.error("[OPS] Error fetching postulacion documents:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener documentos de postulación" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "config", "ops")) {
      return NextResponse.json({ success: false, error: "Sin permiso" }, { status: 403 });
    }
    const raw = await request.json();
    const parsed = postBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 400 }
      );
    }
    const items: PostulacionDocumentItem[] = parsed.data.documents.map((d) => ({
      code: d.code.trim(),
      label: d.label.trim(),
      required: d.required,
    }));
    const previousRaw = await getStoredPostulacionDocumentTypesRaw(ctx.tenantId);
    const previousEffective = getEffectivePostulacionDocuments(previousRaw);
    const removalCheck = await validatePostulacionDocumentRemoval(ctx.tenantId, previousEffective, items);
    if (!removalCheck.ok) {
      return NextResponse.json({ success: false, error: removalCheck.error }, { status: 400 });
    }
    const saved = await setPostulacionDocumentTypes(items, ctx.tenantId);
    const counts = await prisma.opsDocumentoPersona.groupBy({
      by: ["type"],
      where: { tenantId: ctx.tenantId },
      _count: { _all: true },
    });
    const documentCountsByType: Record<string, number> = {};
    for (const row of counts) {
      documentCountsByType[row.type] = row._count._all;
    }
    return NextResponse.json({ success: true, data: saved, documentCountsByType });
  } catch (error) {
    console.error("[OPS] Error saving postulacion documents:", error);
    return NextResponse.json(
      { success: false, error: "Error al guardar documentos de postulación" },
      { status: 500 }
    );
  }
}
