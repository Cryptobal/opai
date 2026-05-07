import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { reportRequestSchema } from "@/lib/validations/finance-reports";
import { getDashboardKpis } from "@/modules/finance/reports/dashboard.service";
import { buildDashboardWorkbook } from "@/modules/finance/reports/exporters/excel.exporter";
import { DashboardPdf } from "@/modules/finance/reports/exporters/pdf/DashboardPdf";
import { prisma } from "@/lib/prisma";

const exportSchema = z.object({
  format: z.enum(["xlsx", "pdf"]),
  request: reportRequestSchema,
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
  const data = await getDashboardKpis(ctx.tenantId, request.period, request.filters);

  if (format === "xlsx") {
    const buf = await buildDashboardWorkbook(data, tenantName);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="dashboard-${request.period.from}-${request.period.to}.xlsx"`,
      },
    });
  }
  const pdf = await renderToBuffer(DashboardPdf({ data, tenantName }));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="dashboard-${request.period.from}-${request.period.to}.pdf"`,
    },
  });
}
