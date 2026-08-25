import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { createTenantSignerSchema } from "@/lib/validations/docs";
import { requireLaboralesEdit, requireLaboralesView } from "@/lib/docs/laborales/perms";
import {
  createTenantSigner,
  listTenantSigners,
} from "@/lib/docs/laborales/tenant-signers.service";

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireLaboralesView(ctx);
  if (forbidden) return forbidden;
  const data = await listTenantSigners(ctx.tenantId);
  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireLaboralesEdit(ctx);
    if (forbidden) return forbidden;
    const parsed = await parseBody(request, createTenantSignerSchema);
    if (parsed.error) return parsed.error;
    const created = await createTenantSigner(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
