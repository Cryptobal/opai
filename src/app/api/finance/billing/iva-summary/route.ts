/**
 * API Route: /api/finance/billing/iva-summary?periodo=YYYY-MM
 *
 * Resumen mensual del Libro IVA (Ventas + Compras + F29 calculado).
 * Usa `FinanceDte.date` (fecha tributaria), NO `createdAt`.
 *
 * Auth: requiere `canView(perms, "finance", "facturacion")`.
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
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json(
      {
        success: false,
        error: "Parámetro 'periodo' requerido (formato YYYY-MM)",
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
      date: { gte: start, lt: end },
      siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
    },
    select: {
      id: true,
      direction: true,
      dteType: true,
      folio: true,
      date: true,
      issuerRut: true,
      issuerName: true,
      receiverRut: true,
      receiverName: true,
      netAmount: true,
      taxAmount: true,
      totalAmount: true,
      siiStatus: true,
      referenceType: true,
      referenceFolio: true,
    },
    orderBy: [{ direction: "asc" }, { date: "asc" }, { folio: "asc" }],
  });

  const issued = dtes.filter((d) => d.direction === "ISSUED");
  const received = dtes.filter((d) => d.direction === "RECEIVED");

  const sumOf = (
    rows: typeof dtes,
    field: "netAmount" | "taxAmount" | "totalAmount",
  ) => rows.reduce((acc, r) => acc + r[field].toNumber(), 0);

  const issuedFacturas = issued.filter((d) => [33, 34].includes(d.dteType));
  const issuedNotasCredito = issued.filter((d) => d.dteType === 61);
  const issuedNotasDebito = issued.filter((d) => d.dteType === 56);

  const ventaNeto = sumOf(issuedFacturas, "netAmount");
  const ventaIva = sumOf(issuedFacturas, "taxAmount");
  const ncNeto = sumOf(issuedNotasCredito, "netAmount");
  const ncIva = sumOf(issuedNotasCredito, "taxAmount");
  const ndNeto = sumOf(issuedNotasDebito, "netAmount");
  const ndIva = sumOf(issuedNotasDebito, "taxAmount");

  const compraNeto = sumOf(received, "netAmount");
  const compraIva = sumOf(received, "taxAmount");

  const debitoFiscal = ventaIva + ndIva - ncIva;
  const creditoFiscal = compraIva;
  const ivaResultado = debitoFiscal - creditoFiscal;

  return NextResponse.json({
    success: true,
    data: {
      periodo,
      ventas: {
        facturasCount: issuedFacturas.length,
        notasCreditoCount: issuedNotasCredito.length,
        notasDebitoCount: issuedNotasDebito.length,
        ventaNeto,
        ventaIva,
        ncNeto,
        ncIva,
        ndNeto,
        ndIva,
        debitoFiscal,
      },
      compras: {
        count: received.length,
        compraNeto,
        compraIva,
        creditoFiscal,
      },
      f29: {
        debitoFiscal,
        creditoFiscal,
        ivaResultado,
        esIvaAFavor: ivaResultado < 0,
      },
      documentos: dtes.map((d) => ({
        id: d.id,
        direction: d.direction,
        dteType: d.dteType,
        folio: d.folio,
        date: d.date.toISOString().split("T")[0],
        rut: d.direction === "ISSUED" ? d.receiverRut : d.issuerRut,
        name: d.direction === "ISSUED" ? d.receiverName : d.issuerName,
        netAmount: d.netAmount.toNumber(),
        taxAmount: d.taxAmount.toNumber(),
        totalAmount: d.totalAmount.toNumber(),
        siiStatus: d.siiStatus,
        referenceType: d.referenceType,
        referenceFolio: d.referenceFolio,
      })),
    },
  });
}
