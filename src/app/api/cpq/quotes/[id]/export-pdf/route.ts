/**
 * API Route: Exportar cotización CPQ como PDF
 * POST /api/cpq/quotes/[id]/export-pdf
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatCurrency, formatUFSuffix } from '@/lib/utils';
import { getUfValue, clpToUf } from '@/lib/uf';
import { computeCpqQuoteCosts } from '@/modules/cpq/costing/compute-quote-costs';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.user.tenantId;

    // Obtener cotización completa con CRM context
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId },
      include: {
        positions: {
          include: {
            cargo: true,
            rol: true,
            puestoTrabajo: true,
          },
        },
        parameters: true,
        installation: true,
      },
    });

    if (!quote) {
      return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 });
    }

    // Load contact if available
    let contactName = '';
    if (quote.contactId) {
      const contact = await prisma.crmContact.findUnique({
        where: { id: quote.contactId },
        select: { firstName: true, lastName: true },
      });
      if (contact) {
        contactName = `${contact.firstName} ${contact.lastName}`.trim();
      }
    }

    const installationName = quote.installation?.name || '';

    // Load deal (negocio) name
    let dealName = '';
    if (quote.dealId) {
      const deal = await prisma.crmDeal.findUnique({
        where: { id: quote.dealId },
        select: { title: true },
      });
      if (deal) dealName = deal.title;
    }

    // Calcular costos en servidor
    let summary: Awaited<ReturnType<typeof computeCpqQuoteCosts>> | null = null;
    try {
      summary = await computeCpqQuoteCosts(id);
    } catch {
      // Si falla el cálculo, el HTML se genera sin resumen de costos adicionales
    }

    // Pricing parameters
    const marginPct = Number(quote.parameters?.marginPct ?? 13);
    const margin = marginPct / 100;
    const financialRatePctVal = Number(quote.parameters?.financialRatePct ?? 2.5);
    const policyRatePctVal = Number(quote.parameters?.policyRatePct ?? 0);
    const policyContractMonthsVal = Number(quote.parameters?.policyContractMonths ?? 12);
    const policyContractPctVal = Number(quote.parameters?.policyContractPct ?? 100);
    const contractMonthsVal = Number(quote.parameters?.contractMonths ?? 12);
    const policyFactor = contractMonthsVal > 0
      ? (policyContractMonthsVal * (policyContractPctVal / 100)) / contractMonthsVal
      : 0;

    const totalGuards =
      summary?.totalGuards ??
      quote.positions.reduce(
        (s: number, p: { numGuards: number; numPuestos?: number }) =>
          s + p.numGuards * (p.numPuestos || 1),
        0
      );
    const currency = (quote.currency || 'CLP') as 'CLP' | 'UF';
    const ufVal = currency === 'UF' ? await getUfValue() : 0;

    const formatPrice = (clp: number) =>
      currency === 'UF' && ufVal > 0 ? formatUFSuffix(clpToUf(clp, ufVal)) : formatCurrency(clp, 'CLP');

    // Base additional costs (everything except financials/policy)
    const baseAdditionalCostsTotal = summary
      ? Math.max(0, (summary.monthlyExtras ?? 0) - (summary.monthlyFinancial ?? 0) - (summary.monthlyPolicy ?? 0))
      : 0;

    // Shift type helper
    const shiftLabel = (startTime: string | null | undefined) => {
      if (!startTime) return 'Diurno';
      const hour = parseInt(startTime.split(':')[0], 10);
      if (isNaN(hour)) return 'Diurno';
      return hour >= 18 || hour < 6 ? 'Nocturno' : 'Diurno';
    };

    // Compute sale price per position
    const positionsRows = quote.positions
      .map(
        (pos: { id: string; customName?: string | null; puestoTrabajo?: { name: string } | null; numGuards: number; numPuestos?: number; startTime?: string | null; endTime?: string | null; weekdays?: string[] | null; monthlyPositionCost: unknown }) => {
          const guardsInPosition = pos.numGuards * (pos.numPuestos || 1);
          const proportion = totalGuards > 0 ? guardsInPosition / totalGuards : 0;
          const additionalForPos = baseAdditionalCostsTotal * proportion;
          const totalCostPos = Number(pos.monthlyPositionCost) + additionalForPos;
          const bwm = margin < 1 ? totalCostPos / (1 - margin) : totalCostPos;
          const fc = bwm * (financialRatePctVal / 100);
          const pc = bwm * (policyRatePctVal / 100) * policyFactor;
          const salePrice = bwm + fc + pc;
          const numPuestos = pos.numPuestos || 1;
          const shift = shiftLabel(pos.startTime);
          return `<tr><td>${pos.customName || pos.puestoTrabajo?.name || 'Puesto'}</td><td>${pos.numGuards}</td><td>${numPuestos}</td><td>${pos.startTime || '-'} - ${pos.endTime || '-'}</td><td>${shift === 'Nocturno' ? '🌙' : '☀️'} ${shift}</td><td>${(pos.weekdays?.join(', ') || '-').replace(/,/g, ', ')}</td><td class="num">${formatPrice(salePrice)}</td></tr>`;
        }
      )
      .join('');

    // Total sale price
    let totalSalePrice = 0;
    if (summary) {
      const costsBase =
        summary.monthlyPositions +
        (summary.monthlyUniforms ?? 0) +
        (summary.monthlyExams ?? 0) +
        (summary.monthlyMeals ?? 0) +
        (summary.monthlyVehicles ?? 0) +
        (summary.monthlyInfrastructure ?? 0) +
        (summary.monthlyCostItems ?? 0);
      const baseWithMargin = margin < 1 ? costsBase / (1 - margin) : costsBase;
      totalSalePrice = baseWithMargin + (summary.monthlyFinancial ?? 0) + (summary.monthlyPolicy ?? 0);
    }

    const validUntilStr = quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('es-CL') : '';
    const notesEscaped = quote.notes ? String(quote.notes).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') : '';
    const serviceDetailEscaped = quote.serviceDetail ? String(quote.serviceDetail).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') : '';

    const contactLine = contactName ? `${contactName}<br>` : '';
    const installationLine = installationName ? `${installationName}<br>` : '';
    const contextHtml = (dealName || installationName)
      ? `<div style="margin-bottom:10px;padding:6px 10px;background:#f0fdf4;border-left:3px solid #2563eb;border-radius:4px;font-size:10px;color:#333">${dealName ? `<strong>Negocio:</strong> ${dealName}` : ''}${dealName && installationName ? ' &middot; ' : ''}${installationName ? `<strong>Instalación:</strong> ${installationName}` : ''}</div>`
      : '';

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${quote.code} - ${quote.clientName || 'Cliente'}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10px; line-height: 1.3; color: #1a1a1a; padding: 10px 14px; max-width: 210mm; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 10px; }
    .brand { font-size: 18px; font-weight: bold; color: #1e3a5f; }
    .brand-sub { font-size: 9px; color: #64748b; margin-top: 2px; }
    .meta { text-align: right; font-size: 10px; color: #444; }
    .meta strong { display: block; font-size: 12px; color: #1a1a1a; margin-bottom: 2px; }
    h2 { font-size: 11px; margin-bottom: 6px; color: #1e3a5f; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 10px; }
    th { background: #eff6ff; padding: 5px 6px; text-align: left; font-weight: 600; color: #1e3a5f; }
    td { padding: 4px 6px; border-bottom: 1px solid #eee; }
    td.num { text-align: right; white-space: nowrap; }
    tr.total td { font-weight: bold; border-top: 2px solid #2563eb; background: #eff6ff; padding: 6px; font-size: 11px; color: #1e3a5f; }
    .notes { font-size: 9px; color: #555; margin-top: 8px; padding: 6px; background: #f8fafc; border-radius: 4px; border-left: 3px solid #2563eb; }
    .footer { margin-top: 10px; padding-top: 6px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 9px; color: #94a3b8; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">GARD SECURITY</div>
      <div class="brand-sub">Servicios de seguridad integral</div>
    </div>
    <div class="meta">
      <strong>${quote.code}</strong>
      ${quote.clientName || 'Cliente'}<br>
      ${contactLine}${installationLine}${validUntilStr ? `Válida hasta: ${validUntilStr}` : ''}
    </div>
  </div>

  ${contextHtml}
  ${quote.aiDescription ? `<p style="font-size:10px;color:#555;padding:6px;background:#f8fafc;border-radius:4px;margin-bottom:10px;font-style:italic">${String(quote.aiDescription).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>` : ''}

  <h2>Puestos de trabajo · ${totalGuards} guardia(s)</h2>
  <table>
    <thead><tr><th>Puesto</th><th>Guardias</th><th>Cantidad</th><th>Horario</th><th>Turno</th><th>Días</th><th class="num">Precio mensual</th></tr></thead>
    <tbody>${positionsRows}<tr class="total"><td colspan="6" style="text-align:right">Precio venta mensual</td><td class="num">${totalSalePrice > 0 ? formatPrice(totalSalePrice) : 'N/A'}</td></tr></tbody>
  </table>

  ${serviceDetailEscaped ? `<div style="margin-top:10px"><h2>Detalle del servicio</h2><p style="font-size:10px;color:#333;line-height:1.5">${serviceDetailEscaped}</p></div>` : ''}

  ${notesEscaped ? `<div class="notes">Notas: ${notesEscaped}</div>` : ''}

  <div class="footer">Generado el ${new Date().toLocaleDateString('es-CL')} · www.gard.cl · contacto@gard.cl</div>
</body>
</html>`.trim();

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${quote.code}-propuesta.html"`,
      },
    });
  } catch (error) {
    console.error('Error generating CPQ PDF:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
