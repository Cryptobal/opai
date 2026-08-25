import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { replaceLaboralSignersSchema } from "@/lib/validations/docs";
import { requireLaboralesEdit } from "@/lib/docs/laborales/perms";
import { replaceTemplateSigners } from "@/lib/docs/laborales/signers.service";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireLaboralesEdit(ctx);
    if (forbidden) return forbidden;
    const { id } = await params;
    const parsed = await parseBody(request, replaceLaboralSignersSchema);
    if (parsed.error) return parsed.error;
    const signers = await replaceTemplateSigners(ctx.tenantId, id, parsed.data.signers);
    return NextResponse.json({ success: true, data: signers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    const status = message.includes("no encontrada") ? 404 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
