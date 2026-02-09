/**
 * API Route: Exportar cotización CPQ como PDF
 * POST /api/cpq/quotes/[id]/export-pdf
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/utils';

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

    // Obtener cotización completa
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
      },
    });

    if (!quote) {
      return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 });
    }

    // Obtener costos calculados
    const costsResponse = await fetch(
      `${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/cpq/quotes/${id}/costs`,
      { cache: 'no-store' }
    );
    const costsData = await costsResponse.json();
    const summary = costsData.success ? costsData.data.summary : null;

    // Generar HTML simple para el PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Arial', sans-serif; padding: 40px; color: #1a1a1a; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #1db990; padding-bottom: 20px; }
    .header h1 { font-size: 28px; color: #1db990; margin-bottom: 10px; }
    .header p { font-size: 14px; color: #666; }
    .section { margin-bottom: 30px; }
    .section-title { font-size: 16px; font-weight: bold; margin-bottom: 15px; color: #1a1a1a; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #f5f5f5; padding: 10px; text-align: left; font-size: 12px; font-weight: 600; border-bottom: 2px solid #ddd; }
    td { padding: 10px; font-size: 12px; border-bottom: 1px solid #eee; }
    .total-row { font-weight: bold; background: #f9f9f9; }
    .total-row td { border-top: 2px solid #1db990; font-size: 14px; }
    .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <h1>GARD SECURITY</h1>
    <p>Propuesta Económica de Servicios de Seguridad</p>
    <p style="margin-top: 10px;"><strong>${quote.code}</strong> · ${quote.clientName || 'Cliente'}</p>
    ${quote.validUntil ? `<p>Válida hasta: ${new Date(quote.validUntil).toLocaleDateString('es-CL')}</p>` : ''}
  </div>

  <div class="section">
    <div class="section-title">Puestos de Trabajo</div>
    <table>
      <thead>
        <tr>
          <th>Puesto</th>
          <th>Guardias</th>
          <th>Horario</th>
          <th>Días</th>
          <th style="text-align: right;">Costo Mensual</th>
        </tr>
      </thead>
      <tbody>
        ${quote.positions.map((pos: any) => `
          <tr>
            <td>${pos.customName || pos.puestoTrabajo?.name || 'Puesto'}</td>
            <td>${pos.numGuards}</td>
            <td>${pos.startTime || ''} - ${pos.endTime || ''}</td>
            <td>${pos.weekdays?.join(', ') || 'N/A'}</td>
            <td style="text-align: right;">${formatCurrency(Number(pos.monthlyPositionCost), 'CLP')}</td>
          </tr>
        `).join('')}
        <tr class="total-row">
          <td colspan="4" style="text-align: right;">Total Puestos:</td>
          <td style="text-align: right;">${summary ? formatCurrency(summary.monthlyPositions, 'CLP') : 'N/A'}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${summary ? `
  <div class="section">
    <div class="section-title">Costos Adicionales</div>
    <table>
      <tbody>
        ${summary.monthlyUniforms > 0 ? `<tr><td>Uniformes</td><td style="text-align: right;">${formatCurrency(summary.monthlyUniforms, 'CLP')}</td></tr>` : ''}
        ${summary.monthlyExams > 0 ? `<tr><td>Exámenes médicos/psicológicos</td><td style="text-align: right;">${formatCurrency(summary.monthlyExams, 'CLP')}</td></tr>` : ''}
        ${summary.monthlyMeals > 0 ? `<tr><td>Alimentación</td><td style="text-align: right;">${formatCurrency(summary.monthlyMeals, 'CLP')}</td></tr>` : ''}
        ${summary.monthlyVehicles > 0 ? `<tr><td>Vehículos</td><td style="text-align: right;">${formatCurrency(summary.monthlyVehicles, 'CLP')}</td></tr>` : ''}
        ${summary.monthlyInfrastructure > 0 ? `<tr><td>Infraestructura</td><td style="text-align: right;">${formatCurrency(summary.monthlyInfrastructure, 'CLP')}</td></tr>` : ''}
        ${summary.monthlyCostItems > 0 ? `<tr><td>Costos operacionales</td><td style="text-align: right;">${formatCurrency(summary.monthlyCostItems, 'CLP')}</td></tr>` : ''}
        ${summary.monthlyFinancial > 0 ? `<tr><td>Costo financiero</td><td style="text-align: right;">${formatCurrency(summary.monthlyFinancial, 'CLP')}</td></tr>` : ''}
        ${summary.monthlyPolicy > 0 ? `<tr><td>Póliza de seguro</td><td style="text-align: right;">${formatCurrency(summary.monthlyPolicy, 'CLP')}</td></tr>` : ''}
        <tr class="total-row">
          <td style="text-align: right;">COSTO TOTAL MENSUAL:</td>
          <td style="text-align: right;">${formatCurrency(summary.monthlyTotal, 'CLP')}</td>
        </tr>
      </tbody>
    </table>
  </div>
  ` : ''}

  ${quote.notes ? `
  <div class="section">
    <div class="section-title">Notas</div>
    <p style="font-size: 12px; color: #666; line-height: 1.6;">${quote.notes}</p>
  </div>
  ` : ''}

  <div class="footer">
    <p>GARD Security · Propuesta generada el ${new Date().toLocaleDateString('es-CL')}</p>
    <p>www.gard.cl · contacto@gard.cl</p>
  </div>
</body>
</html>
    `.trim();

    // Por ahora retornar el HTML (en producción usarías Playwright para convertir a PDF)
    // Para simplificar, retornamos HTML que el navegador puede imprimir como PDF
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
