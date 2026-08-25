import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { updateTenantSignerSchema } from "@/lib/validations/docs";
import { requireLaboralesEdit } from "@/lib/docs/laborales/perms";
import { updateTenantSigner } from "@/lib/docs/laborales/tenant-signers.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireLaboralesEdit(ctx);
    if (forbidden) return forbidden;
    const { id } = await params;
    const parsed = await parseBody(request, updateTenantSignerSchema);
    if (parsed.error) return parsed.error;
    const updated = await updateTenantSigner(ctx.tenantId, id, parsed.data);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    const status = message === "Firmante no encontrado" ? 404 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
