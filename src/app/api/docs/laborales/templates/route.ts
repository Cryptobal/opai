import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { createLaboralTemplateSchema } from "@/lib/validations/docs";
import { requireLaboralesEdit, requireLaboralesView } from "@/lib/docs/laborales/perms";
import {
  createLaboralTemplate,
  getScopeCounts,
  listLaboralTemplates,
  listTenantInstallations,
} from "@/lib/docs/laborales/templates.service";

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireLaboralesView(ctx);
  if (forbidden) return forbidden;
  const [templates, counts, installations] = await Promise.all([
    listLaboralTemplates(ctx.tenantId, ctx.userId),
    getScopeCounts(ctx.tenantId),
    listTenantInstallations(ctx.tenantId),
  ]);
  return NextResponse.json({ success: true, data: { templates, counts, installations } });
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireLaboralesEdit(ctx);
    if (forbidden) return forbidden;
    const parsed = await parseBody(request, createLaboralTemplateSchema);
    if (parsed.error) return parsed.error;
    const created = await createLaboralTemplate(ctx.tenantId, ctx.userId, parsed.data);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
