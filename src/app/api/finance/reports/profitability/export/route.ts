import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { profitabilityRequestSchema } from "@/lib/validations/finance-reports";
import { getProfitability } from "@/modules/finance/reports/profitability.service";
import { buildProfitabilityWorkbook } from "@/modules/finance/reports/exporters/excel.exporter";
import { ProfitabilityPdf } from "@/modules/finance/reports/exporters/pdf/ProfitabilityPdf";
import { prisma } from "@/lib/prisma";

const exportSchema = z.object({
  format: z.enum(["xlsx", "pdf"]),
  request: profitabilityRequestSchema,
});

export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "finance_reports_export")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para exportar" },
      { status: 403 }
    );
  }
  const parsed = await parseBody(req, exportSchema);
  if (parsed.error) return parsed.error;
  const { format, request } = parsed.data;
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true },
  });
  const tenantName = tenant?.name ?? "OPAI";
  const data = await getProfitability(ctx.tenantId, request.period, request.filters, {
    opexAllocationMethod: request.opexAllocationMethod,
  });

  if (format === "xlsx") {
    const buf = await buildProfitabilityWorkbook(data, tenantName);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rentabilidad-${request.period.from}-${request.period.to}.xlsx"`,
      },
    });
  }
  const pdf = await renderToBuffer(ProfitabilityPdf({ data, tenantName }));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rentabilidad-${request.period.from}-${request.period.to}.pdf"`,
    },
  });
}
