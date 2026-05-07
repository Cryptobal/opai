import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { ledgerRequestSchema } from "@/lib/validations/finance-reports";
import { getExtendedLedger } from "@/modules/finance/reports/ledger-extended.service";
import { buildLedgerWorkbook } from "@/modules/finance/reports/exporters/excel.exporter";
import { LedgerPdf } from "@/modules/finance/reports/exporters/pdf/LedgerPdf";
import { prisma } from "@/lib/prisma";

const exportSchema = z.object({
  format: z.enum(["xlsx", "pdf"]),
  request: ledgerRequestSchema,
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
  const data = await getExtendedLedger(
    ctx.tenantId,
    request.accountId,
    request.period,
    request.filters
  );

  if (format === "xlsx") {
    const buf = await buildLedgerWorkbook(data, tenantName);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="mayor-${data.account.code}-${request.period.from}-${request.period.to}.xlsx"`,
      },
    });
  }
  const pdf = await renderToBuffer(LedgerPdf({ data, tenantName }));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mayor-${data.account.code}-${request.period.from}-${request.period.to}.pdf"`,
    },
  });
}
