import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireLaboralesEdit } from "@/lib/docs/laborales/perms";
import { uploadTenantSignerSignature } from "@/lib/docs/laborales/tenant-signers.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireLaboralesEdit(ctx);
    if (forbidden) return forbidden;
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
    const updated = await uploadTenantSignerSignature(
      ctx.tenantId,
      id,
      buffer,
      file.type,
      file.name,
    );
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    const status = message === "Firmante no encontrado" ? 404 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
