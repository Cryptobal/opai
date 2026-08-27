import { NextRequest, NextResponse } from "next/server";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import {
  generateReportQrLote,
  listReportQrLotes,
} from "@/lib/incidentes-instalacion/report-qr";
import { requireReportQrAuth } from "../_guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const authz = await requireReportQrAuth("view");
  if (authz.error) return authz.error;
  const lotes = await listReportQrLotes(authz.ctx.tenantId);
  return NextResponse.json({ success: true, data: lotes });
}

export async function POST(request: NextRequest) {
  const authz = await requireReportQrAuth("edit");
  if (authz.error) return authz.error;
  try {
    const body = await request.json();
    const quantity = Number(body.quantity);
    const note = typeof body.note === "string" ? body.note : null;
    const lote = await generateReportQrLote({
      tenantId: authz.ctx.tenantId,
      actorId: authz.ctx.userId,
      quantity,
      note,
    });
    return NextResponse.json({ success: true, data: lote });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    const message = err instanceof Error ? err.message : "No se pudo generar el lote";
    const status = message.includes("cantidad") ? 422 : 500;
    if (status === 500) console.error("[report-qrs/lotes]", err);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
