/** POST /api/crm/files/[id]/reprocess-text — reextrae texto de un archivo CRM. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { ingestDocumentoTexto } from "@/modules/crm/documents/licitacion-ingest.service";

export const maxDuration = 60;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmEdit(ctx);
  if (forbidden) return forbidden;

  const { id: fileId } = await params;
  const file = await prisma.documento.findFirst({
    where: { id: fileId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!file) {
    return NextResponse.json({ success: false, error: "Archivo no encontrado" }, { status: 404 });
  }

  const ingest = await ingestDocumentoTexto({ tenantId: ctx.tenantId, fileId, force: true });
  return NextResponse.json({ success: true, data: ingest });
}
