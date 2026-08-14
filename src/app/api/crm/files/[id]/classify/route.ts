/** POST /api/crm/files/[id]/classify — asigna TipoDocumento e ingesta texto si aplica. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { assignDocumentoTipo } from "@/modules/crm/documents/licitacion-ingest.service";

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
  const tipoCodigoRaw = typeof body.tipoCodigo === "string" ? body.tipoCodigo.trim() : "";
  const clear = tipoCodigoRaw === "" || tipoCodigoRaw === "__none__";
  const entityType = typeof body.entityType === "string" ? body.entityType.trim() : "";
  const entityId = typeof body.entityId === "string" ? body.entityId.trim() : "";
  if (!entityType || !entityId) {
    return NextResponse.json(
      { success: false, error: "entityType y entityId son requeridos" },
      { status: 400 },
    );
  }
  if (!clear && !tipoCodigoRaw) {
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

  try {
    const result = await assignDocumentoTipo({
      tenantId: ctx.tenantId,
      fileId,
      tipoCodigo: clear ? null : tipoCodigoRaw,
    });
    return NextResponse.json({
      success: true,
      data: { tipo: result.tipo, ingest: result.ingest },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo clasificar";
    if (message.startsWith("Tipo de documento desconocido")) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
