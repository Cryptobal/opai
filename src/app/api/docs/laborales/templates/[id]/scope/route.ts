import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { updateLaboralScopeSchema } from "@/lib/validations/docs";
import { requireLaboralesEdit } from "@/lib/docs/laborales/perms";
import { updateLaboralScope } from "@/lib/docs/laborales/templates.service";

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
    const parsed = await parseBody(request, updateLaboralScopeSchema);
    if (parsed.error) return parsed.error;
    const updated = await updateLaboralScope(ctx.tenantId, id, parsed.data);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    const status = message.includes("no encontrada") ? 404 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
