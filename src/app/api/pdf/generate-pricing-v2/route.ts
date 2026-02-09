/**
 * API Route para generar PDF de propuesta económica usando Playwright
 * Genera PDFs idénticos al template HTML
 * 
 * PRODUCCIÓN: Usa @sparticuz/chromium optimizado para Vercel
 */

import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium';
import { PricingData } from '@/types/presentation';
import { formatCurrency, formatUF } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel: 60s timeout para Pro plan

interface PricingRequest {
  clientName: string;
  quoteNumber: string;
  quoteDate: string;
  pricing: PricingData;
  contactEmail?: string;
  contactPhone?: string;
}

// Logo SVG como base64
const LOGO_SVG_BASE64 = `data:image/svg+xml;base64,${Buffer.from(`<svg width="180" height="60" viewBox="0 0 180 60" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(0, 5)">
    <path d="M15 8 L25 3 L35 8 L35 20 C35 28 25 35 25 35 C25 35 15 28 15 20 Z" fill="white" opacity="0.95"/>
    <path d="M20 13 L24 17 L30 11" stroke="#5dc1b9" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="50" y="33" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900" fill="white" letter-spacing="1.2">GARD</text>
  <text x="50" y="47" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="400" fill="white" letter-spacing="4.5" opacity="0.9">SECURITY</text>
</svg>`).toString('base64')}`;

// Función para generar el HTML del PDF
function generatePricingHTML(data: PricingRequest): string {
  const { clientName, quoteNumber, quoteDate, pricing, contactEmail, contactPhone } = data;
  
  const formatPrice = (value: number) => {
    const curr = pricing.currency as string;
    if (curr === 'CLF' || curr === 'UF' || curr === 'uf') {
      return formatUF(value);
    } else {
      return formatCurrency(value, 'CLP');
    }
  };

  const itemsHTML = pricing.items.map(item => `
    <tr class="border-b border-gray-100">
      <td class="py-3 px-4 text-sm text-gray-700 leading-relaxed">${item.description}</td>
      <td class="py-3 px-4 text-center text-sm text-gray-600">${item.quantity}</td>
      <td class="py-3 px-4 text-right text-sm text-gray-600">${formatPrice(item.unit_price)}</td>
      <td class="py-3 px-4 text-right text-sm font-bold text-gray-900">${formatPrice(item.subtotal)}</td>
    </tr>
  `).join('');

  const conditionsHTML = `
    ${pricing.payment_terms ? `<div style="font-size: 10px; color: #334155; margin-bottom: 6px; line-height: 1.4;">• <strong>Forma de pago:</strong> ${pricing.payment_terms}</div>` : ''}
    ${pricing.adjustment_terms ? `<div style="font-size: 10px; color: #334155; margin-bottom: 6px; line-height: 1.4;">• <strong>Reajuste:</strong> ${pricing.adjustment_terms}</div>` : ''}
    ${pricing.notes ? pricing.notes.map(note => `<div style="font-size: 10px; color: #334155; margin-bottom: 6px; line-height: 1.4;">• ${note}</div>`).join('') : ''}
  `;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Propuesta Económica - ${clientName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    @page {
      margin: 0;
      size: A4;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: white;
      color: #1e293b;
      line-height: 1.4;
    }
    
    .page {
      width: 210mm;
      padding: 0;
      margin: 0 auto;
      background: white;
      position: relative;
    }
    
    .header {
      background: linear-gradient(135deg, #5dc1b9 0%, #4a9d96 100%);
      padding: 20px 40px 18px 40px;
      margin-bottom: 0;
    }
    
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    
    .logo-container {
      display: flex;
      align-items: center;
    }
    
    .logo {
      width: 100px;
      height: auto;
    }
    
    .title {
      font-size: 22px;
      font-weight: 700;
      color: white;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }
    
    .client-info {
      color: rgba(255, 255, 255, 0.95);
      font-size: 10px;
      margin-bottom: 2px;
      font-weight: 400;
      line-height: 1.5;
    }
    
    .client-info strong {
      font-weight: 600;
      margin-right: 3px;
    }
    
    .content {
      padding: 30px 40px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      page-break-inside: auto;
    }
    
    thead {
      display: table-header-group;
    }
    
    thead tr {
      background: #f8fafc;
      border-bottom: 2px solid #5dc1b9;
    }
    
    th {
      padding: 10px 12px;
      text-align: left;
      font-size: 9px;
      font-weight: 700;
      color: #1e293b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    th:nth-child(2) {
      text-align: center;
    }
    
    th:nth-child(3),
    th:nth-child(4) {
      text-align: right;
    }
    
    tbody tr {
      page-break-inside: avoid;
      border-bottom: 1px solid #f1f5f9;
    }
    
    td {
      padding: 10px 12px;
      font-size: 11px;
      color: #334155;
      line-height: 1.4;
    }
    
    .total-box {
      background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
      border: 2px solid #5dc1b9;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 20px 0 8px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      page-break-inside: avoid;
    }
    
    .total-label {
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
      letter-spacing: 0.3px;
    }
    
    .total-amount {
      font-size: 28px;
      font-weight: 700;
      color: #0d9488;
      letter-spacing: -0.5px;
    }
    
    .note {
      font-size: 8px;
      color: #64748b;
      font-style: italic;
      margin-bottom: 18px;
      padding-left: 2px;
    }
    
    .conditions {
      background: #f9fafb;
      border-left: 3px solid #5dc1b9;
      border-radius: 6px;
      padding: 18px 22px;
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    
    .conditions-title {
      font-size: 12px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 10px;
    }
    
    .footer {
      padding: 18px 40px 25px 40px;
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #64748b;
      page-break-inside: avoid;
    }
    
    .footer-left,
    .footer-right {
      line-height: 1.6;
    }
    
    .footer-right {
      text-align: right;
    }
    
    @media print {
      .page {
        margin: 0;
        padding: 0;
      }
      
      .header {
        page-break-after: avoid;
      }
      
      .content {
        page-break-before: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-top">
        <div class="logo-container">
          <img src="${LOGO_SVG_BASE64}" alt="Gard Security" class="logo" />
        </div>
        <div class="page-number"></div>
      </div>
      
      <h1 class="title">PROPUESTA ECONÓMICA</h1>
      
      <div class="client-info"><strong>Para:</strong> ${clientName}</div>
      <div class="client-info"><strong>Cotización:</strong> ${quoteNumber}</div>
      <div class="client-info"><strong>Fecha:</strong> ${quoteDate}</div>
    </div>
    
    <!-- Content -->
    <div class="content">
      <table>
        <thead>
          <tr>
            <th style="width: 50%;">DESCRIPCIÓN</th>
            <th style="width: 12%;">CANT.</th>
            <th style="width: 19%;">P. UNIT.</th>
            <th style="width: 19%;">SUBTOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>
      
      <!-- Total -->
      <div class="total-box">
        <div class="total-label">TOTAL NETO MENSUAL</div>
        <div class="total-amount">${formatPrice(pricing.subtotal)}</div>
      </div>
      
      <div class="note">Valores netos. IVA se factura según ley.</div>
      
      <!-- Condiciones -->
      ${(pricing.payment_terms || pricing.adjustment_terms || pricing.notes) ? `
        <div class="conditions">
          <div class="conditions-title">Condiciones Comerciales</div>
          ${conditionsHTML}
        </div>
      ` : ''}
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <div class="footer-left">
        <div>${contactEmail || 'comercial@gard.cl'}</div>
        <div>${contactPhone || '+56 98 230 7771'}</div>
      </div>
      <div class="footer-right">
        <div>Gard Security</div>
        <div>www.gard.cl</div>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export async function POST(request: NextRequest) {
  let browser;
  
  try {
    const body: PricingRequest = await request.json();
    const { clientName, quoteNumber, pricing, quoteDate, contactEmail, contactPhone } = body;
    
    if (!pricing) {
      return NextResponse.json(
        { error: 'Faltan datos de pricing' },
        { status: 400 }
      );
    }
    
    // Generar HTML
    const html = generatePricingHTML(body);
    
    // Configuración para Vercel
    const isDev = process.env.NODE_ENV === 'development';
    const executablePath = isDev 
      ? undefined // En desarrollo usa el chromium local de playwright
      : await chromiumPkg.executablePath();
    
    // Lanzar Playwright con configuración para Vercel
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: isDev ? [
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ] : chromiumPkg.args,
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Cargar HTML
    await page.setContent(html, { waitUntil: 'networkidle' });
    
    // Generar PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm'
      },
      preferCSSPageSize: true,
    });
    
    await browser.close();
    
    const fileName = `Propuesta_${clientName?.replace(/\s+/g, '_') || 'Cliente'}_${quoteNumber || 'COT'}.pdf`;
    
    // Convertir Buffer a Uint8Array para NextResponse
    const uint8Array = new Uint8Array(pdfBuffer);
    
    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
    
  } catch (error: any) {
    console.error('Error generando PDF:', error);
    
    if (browser) {
      await browser.close();
    }
    
    return NextResponse.json(
      { error: 'Error generando PDF', details: error.message },
      { status: 500 }
    );
  }
}
