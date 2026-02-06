/**
 * API Route para generar PDF de propuesta económica usando Playwright
 * Genera PDFs idénticos al template HTML
 * 
 * PRODUCCIÓN: Requiere chromium instalado
 * - Vercel: Usa playwright con chromium
 * - Local: npx playwright install chromium
 */

import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { PricingData } from '@/types/presentation';

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
      return `UF ${value.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    } else {
      return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
      }).format(value);
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
    ${pricing.payment_terms ? `<div class="text-sm text-gray-700 mb-2">• Forma de pago: ${pricing.payment_terms}</div>` : ''}
    ${pricing.adjustment_terms ? `<div class="text-sm text-gray-700 mb-2">• Reajuste: ${pricing.adjustment_terms}</div>` : ''}
    ${pricing.notes ? pricing.notes.map(note => `<div class="text-sm text-gray-700 mb-2">• ${note}</div>`).join('') : ''}
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
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: white;
      color: #1e293b;
      line-height: 1.5;
    }
    
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 0;
      margin: 0 auto;
      background: white;
      position: relative;
    }
    
    .header {
      background: #5dc1b9;
      padding: 35px 45px;
      margin-bottom: 0;
    }
    
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 25px;
    }
    
    .logo-container {
      display: flex;
      align-items: center;
    }
    
    .logo {
      width: 125px;
      height: auto;
    }
    
    .page-number {
      color: white;
      font-size: 10px;
      font-weight: 400;
    }
    
    .title {
      font-size: 28px;
      font-weight: 700;
      color: white;
      letter-spacing: 0.3px;
      margin-bottom: 18px;
    }
    
    .client-info {
      color: white;
      font-size: 11px;
      margin-bottom: 4px;
      font-weight: 400;
      line-height: 1.6;
    }
    
    .client-info strong {
      font-weight: 600;
      margin-right: 2px;
    }
    
    .content {
      padding: 40px 50px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    
    thead tr {
      background: #f1f5f9;
      border-bottom: 2px solid #5dc1b9;
    }
    
    th {
      padding: 12px 14px;
      text-align: left;
      font-size: 10px;
      font-weight: 700;
      color: #1e293b;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    
    th:nth-child(2) {
      text-align: center;
    }
    
    th:nth-child(3),
    th:nth-child(4) {
      text-align: right;
    }
    
    tbody tr:hover {
      background: #f8fafc;
    }
    
    td {
      padding: 14px 16px;
    }
    
    .total-box {
      background: #d1fae5;
      border: 2.5px solid #5dc1b9;
      border-radius: 10px;
      padding: 22px 28px;
      margin: 25px 0 10px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .total-label {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
      letter-spacing: 0.3px;
    }
    
    .total-amount {
      font-size: 32px;
      font-weight: 700;
      color: #5dc1b9;
      letter-spacing: -0.3px;
    }
    
    .note {
      font-size: 9px;
      color: #64748b;
      font-style: italic;
      margin-bottom: 25px;
      padding-left: 2px;
    }
    
    .conditions {
      background: #f9fafb;
      border-radius: 12px;
      padding: 24px 30px;
      margin-bottom: 40px;
    }
    
    .conditions-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
    }
    
    .footer {
      position: fixed;
      bottom: 40px;
      left: 50px;
      right: 50px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #64748b;
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
        <div class="page-number">Página 1 de 1</div>
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
        <div>${contactEmail || 'carlos.irigoyen@gard.cl'}</div>
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
    
    // Lanzar Playwright con configuración para Vercel
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
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
