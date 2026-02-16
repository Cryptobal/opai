import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { createPaymentRecordSchema } from "@/lib/validations/finance";
import { listPaymentRecords, createPaymentRecord } from "@/modules/finance/banking/payment-record.service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || undefined;
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "50");
    const result = await listPaymentRecords(ctx.tenantId, { type, dateFrom, dateTo, page, pageSize });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Payments] Error listing records:", error);
    return NextResponse.json({ success: false, error: "Error al listar pagos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, createPaymentRecordSchema);
    if (parsed.error) return parsed.error;
    const record = await createPaymentRecord(ctx.tenantId, ctx.userId, parsed.data);
    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Payments] Error creating record:", error);
    return NextResponse.json({ success: false, error: "Error al crear pago" }, { status: 500 });
  }
}
