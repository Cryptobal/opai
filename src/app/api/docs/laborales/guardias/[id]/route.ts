import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { requireLaboralesEdit, requireLaboralesView } from "@/lib/docs/laborales/perms";
import { listLaboralDocumentsForGuardia, listLaboralTemplatesForGuardia } from "@/lib/docs/laborales/guardia-docs";
import { ResolveSignersError, sendLaboralToGuardia } from "@/lib/docs/laborales/send-laboral";
import { resolveLaboralSigners } from "@/lib/docs/laborales/resolve-signers";
import { sendLaboralSchema } from "@/lib/validations/docs";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireLaboralesView(ctx);
  if (forbidden) return forbidden;
  const { id } = await params;
  const [templates, documents] = await Promise.all([
    listLaboralTemplatesForGuardia(ctx.tenantId, id),
    listLaboralDocumentsForGuardia(ctx.tenantId, id),
  ]);
  return NextResponse.json({ success: true, data: { templates, documents } });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireLaboralesEdit(ctx);
    if (forbidden) return forbidden;
    const rl = checkRateLimit(`laborales-send:${ctx.tenantId}`, { limit: 30, windowSeconds: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: "Demasiados envíos" }, { status: 429 });
    }
    const { id } = await params;
    const parsed = await parseBody(request, sendLaboralSchema);
    if (parsed.error) return parsed.error;
    const preview = await resolveLaboralSigners({
      tenantId: ctx.tenantId,
      templateId: parsed.data.templateId,
      guardiaId: id,
    });
    if (parsed.data.preview) {
      return NextResponse.json({ success: true, data: preview });
    }
    const sent = await sendLaboralToGuardia({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      templateId: parsed.data.templateId,
      guardiaId: id,
    });
    return NextResponse.json({ success: true, data: { ...sent, signers: preview.recipients } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    const status = err instanceof ResolveSignersError ? 400 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
