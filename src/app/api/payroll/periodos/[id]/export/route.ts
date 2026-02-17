/**
 * GET /api/payroll/periodos/[id]/export
 * Export payroll files: previred, libro, banco
 * Query params: type=previred|libro|banco&installationId=optional
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { generateLibroRemuneraciones } from "@/lib/payroll/exporters/libro-remuneraciones-exporter";
import { generatePreviredFile } from "@/lib/payroll/exporters/previred-exporter";
import { generateBankFile } from "@/lib/payroll/exporters/bank-file-exporter";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type") || "libro";
    const installationId = searchParams.get("installationId") || undefined;

    const period = await prisma.payrollPeriod.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!period) {
      return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
    }

    let csv: string;
    let filename: string;

    switch (type) {
      case "previred":
        csv = await generatePreviredFile(id, ctx.tenantId, installationId);
        filename = `Libro_Imposiciones_${period.year}${String(period.month).padStart(2, "0")}.csv`;
        break;
      case "banco":
        csv = await generateBankFile(id, ctx.tenantId, "sueldos");
        filename = `Archivo_Banco_Sueldos_${period.year}${String(period.month).padStart(2, "0")}.csv`;
        break;
      case "banco_anticipos":
        csv = await generateBankFile(id, ctx.tenantId, "anticipos");
        filename = `Archivo_Banco_Anticipos_${period.year}${String(period.month).padStart(2, "0")}.csv`;
        break;
      case "libro":
      default:
        csv = await generateLibroRemuneraciones(id, ctx.tenantId, installationId);
        filename = `Libro_Remuneraciones_${period.year}${String(period.month).padStart(2, "0")}.csv`;
        break;
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/payroll/periodos/[id]/export]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
