/**
 * API Route: /api/finance/billing/iva-summary/export?periodo=YYYY-MM&direction=ISSUED|RECEIVED
 *
 * CSV del Libro de Ventas o Libro de Compras compatible con SII (F29).
 * Codificación UTF-8 con BOM para que Excel lo abra correctamente.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "facturacion")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const periodo = request.nextUrl.searchParams.get("periodo");
  const direction = request.nextUrl.searchParams.get("direction");
  if (
    !periodo ||
    !/^\d{4}-\d{2}$/.test(periodo) ||
    (direction !== "ISSUED" && direction !== "RECEIVED")
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Parámetros requeridos: periodo (YYYY-MM) y direction (ISSUED|RECEIVED)",
      },
      { status: 400 },
    );
  }

  const [year, month] = periodo.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId: ctx.tenantId,
      direction,
      date: { gte: start, lt: end },
      siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
    },
    orderBy: [{ date: "asc" }, { folio: "asc" }],
  });

  const headers = [
    "Tipo Doc",
    "Folio",
    "Fecha",
    "RUT",
    "Razon Social",
    "Neto",
    "IVA",
    "Total",
  ];

  const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const rows = dtes.map((d) => [
    String(d.dteType),
    String(d.folio),
    d.date.toISOString().split("T")[0],
    direction === "ISSUED" ? d.receiverRut : d.issuerRut,
    escapeCsv(direction === "ISSUED" ? d.receiverName : d.issuerName),
    d.netAmount.toString(),
    d.taxAmount.toString(),
    d.totalAmount.toString(),
  ]);

  const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");

  // BOM para que Excel reconozca UTF-8.
  const buffer = Buffer.concat([
    Buffer.from("\uFEFF", "utf8"),
    Buffer.from(csv, "utf8"),
  ]);

  const filename = `libro-${direction === "ISSUED" ? "ventas" : "compras"}-${periodo}.csv`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
