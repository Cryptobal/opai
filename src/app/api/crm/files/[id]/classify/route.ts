/** POST /api/crm/files/[id]/classify — asigna TipoDocumento e ingesta texto si aplica. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { ingestDocumentoTexto } from "@/modules/crm/documents/licitacion-ingest.service";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmEdit(ctx);
  if (forbidden) return forbidden;

  const { id: fileId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    tipoCodigo?: unknown;
    entityType?: unknown;
    entityId?: unknown;
  };
  const tipoCodigo = typeof body.tipoCodigo === "string" ? body.tipoCodigo.trim() : "";
  const entityType = typeof body.entityType === "string" ? body.entityType.trim() : "";
  const entityId = typeof body.entityId === "string" ? body.entityId.trim() : "";
  if (!tipoCodigo || !entityType || !entityId) {
    return NextResponse.json(
      { success: false, error: "tipoCodigo, entityType y entityId son requeridos" },
      { status: 400 },
    );
  }

  const link = await prisma.documentoEnlace.findFirst({
    where: { fileId, tenantId: ctx.tenantId, entityType, entityId },
    select: { id: true },
  });
  if (!link) {
    return NextResponse.json({ success: false, error: "Archivo no encontrado en la entidad" }, { status: 404 });
  }

  const tipo = await prisma.tipoDocumento.findFirst({
    where: { tenantId: ctx.tenantId, codigo: tipoCodigo, isActive: true },
    select: { id: true, codigo: true, nombre: true },
  });
  if (!tipo) {
    return NextResponse.json(
      { success: false, error: `Tipo de documento desconocido: ${tipoCodigo}` },
      { status: 400 },
    );
  }

  await prisma.documento.updateMany({
    where: { id: fileId, tenantId: ctx.tenantId },
    data: { tipoId: tipo.id, needsClassification: false },
  });

  const ingest = await ingestDocumentoTexto({ tenantId: ctx.tenantId, fileId, force: true });
  return NextResponse.json({
    success: true,
    data: { tipo, ingest },
  });
}
