/**
 * POST /api/finance/billing/signers/[id]/upload-signature
 *
 * Sube la imagen PNG/JPG (máx 1MB) de la firma manuscrita y la persiste
 * en R2. Reemplaza cualquier firma anterior. Body: multipart/form-data
 * con field `file`.
 *
 * Permisos: facturacion_configure.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { uploadSignerSignatureImage } from "@/modules/finance/billing/billing-signers.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Falta el archivo (field `file`)" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const updated = await uploadSignerSignatureImage(
      ctx.tenantId,
      id,
      buffer,
      file.type,
      file.name,
    );
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
