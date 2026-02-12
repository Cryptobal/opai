/**
 * API Route para generar PDF completo de presentación usando Playwright
 * 
 * ENFOQUE: Screenshot por sección → Composición en PDF
 * Cada sección se captura como imagen (screenshot) y se compone en un PDF.
 * Esto garantiza fidelidad pixel-perfect: lo que ves en la web = lo que ves en el PDF.
 * 
 * Flujo:
 * 1. Navega a /p/{uniqueId}?mode=pdf (sin header/footer/animaciones)
 * 2. Fuerza visibilidad de todos los elementos
 * 3. Scrollea para cargar imágenes lazy
 * 4. Toma screenshot de cada sección individualmente
 * 5. Compone un HTML con todas las imágenes (una por página)
 * 6. Genera PDF portrait A4 desde ese HTML compuesto
 * 
 * PRODUCCIÓN: Usa @sparticuz/chromium optimizado para Vercel
 */

import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface GeneratePresentationRequest {
  uniqueId: string;
}

export async function POST(request: NextRequest) {
  let browser;
  
  try {
    const body: GeneratePresentationRequest = await request.json();
    const { uniqueId } = body;
    
    if (!uniqueId) {
      return NextResponse.json(
        { error: 'Falta uniqueId de la presentación' },
        { status: 400 }
      );
    }
    
    // Validar presentación
    const presentation = await prisma.presentation.findUnique({
      where: { uniqueId },
    });
    
    if (!presentation) {
      return NextResponse.json({ error: 'Presentación no encontrada' }, { status: 404 });
    }
    
    if (presentation.status === 'draft') {
      return NextResponse.json({ error: 'La presentación aún no ha sido enviada' }, { status: 400 });
    }
    
    // ── URL + Bypass ──
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    
    const urlParams = new URLSearchParams({ mode: 'pdf' });
    if (bypassSecret) {
      urlParams.set('x-vercel-protection-bypass', bypassSecret);
    }
    const pdfUrl = `${baseUrl}/p/${uniqueId}?${urlParams.toString()}`;
    
    console.log(`[PDF] Generando presentación (screenshot mode): ${baseUrl}/p/${uniqueId}`);
    
    // ── Chromium ──
    const isDev = process.env.NODE_ENV === 'development';
    const executablePath = isDev ? undefined : await chromiumPkg.executablePath();
    
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: isDev ? ['--no-sandbox', '--disable-setuid-sandbox'] : chromiumPkg.args,
    });
    
    // Viewport: 1280px (desktop xl: breakpoint)
    // deviceScaleFactor: 1 para velocidad (1280px aún da ~160dpi en A4)
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      extraHTTPHeaders: {
        ...(bypassSecret ? {
          'x-vercel-protection-bypass': bypassSecret,
          'x-vercel-set-bypass-cookie': 'samesitenone',
        } : {}),
      },
    });
    
    if (bypassSecret) {
      const domain = new URL(baseUrl).hostname;
      await context.addCookies([{
        name: 'x-vercel-protection-bypass',
        value: bypassSecret,
        domain,
        path: '/',
      }]);
    }
    
    const page = await context.newPage();
    
    // ── Cargar página ──
    await page.goto(pdfUrl, { waitUntil: 'networkidle', timeout: 45000 });
    
    // Verificar que no estamos en login de Vercel
    const pageTitle = await page.title();
    if (pageTitle.includes('Vercel') || page.url().includes('vercel.com')) {
      throw new Error('Bloqueado por Vercel Deployment Protection. Configura VERCEL_AUTOMATION_BYPASS_SECRET.');
    }
    
    // Esperar hidratación de React
    await page.waitForTimeout(2000);
    
    // ── Forzar visibilidad de elementos Framer Motion ──
    await page.addStyleTag({
      content: `
        [style] { opacity: 1 !important; transform: none !important; }
        * { animation: none !important; transition: none !important; }
      `,
    });
    
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach(el => {
        if (!(el instanceof HTMLElement)) return;
        if (el.style.opacity !== '' && parseFloat(el.style.opacity) < 0.1) {
          el.style.removeProperty('opacity');
        }
        if (el.style.transform && el.style.transform !== 'none') {
          el.style.removeProperty('transform');
        }
      });
    });
    
    // ── Scroll rápido para cargar imágenes lazy ──
    await page.evaluate(async () => {
      const totalHeight = document.body.scrollHeight;
      const step = 800;
      for (let y = 0; y < totalHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 100));
      }
      window.scrollTo(0, 0);
    });
    
    // Esperar imágenes (máx 3s)
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.race([
        Promise.all(images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
        })),
        new Promise(r => setTimeout(r, 3000)),
      ]);
    });
    
    // ── Tomar screenshots de cada sección ──
    const sectionHandles = await page.$$('.section-container');
    console.log(`[PDF] Encontradas ${sectionHandles.length} secciones`);
    
    const screenshots: string[] = [];
    
    for (let i = 0; i < sectionHandles.length; i++) {
      const section = sectionHandles[i];
      
      // Scroll a la sección
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      
      // Screenshot JPEG (liviano para gradientes oscuros, calidad buena)
      const screenshotBuffer = await section.screenshot({ 
        type: 'jpeg', 
        quality: 80,
      });
      
      const base64 = Buffer.from(screenshotBuffer).toString('base64');
      screenshots.push(base64);
      
      console.log(`[PDF] Screenshot sección ${i + 1}/${sectionHandles.length} (${Math.round(screenshotBuffer.length / 1024)}KB)`);
    }
    
    if (screenshots.length === 0) {
      throw new Error('No se encontraron secciones para capturar');
    }
    
    // ── Componer HTML con screenshots ──
    // Cada imagen es una "página" con page-break-after
    // La imagen se escala al ancho de la página, manteniendo proporción
    const imagesHtml = screenshots.map((base64, i) => `
      <div class="page">
        <img src="data:image/jpeg;base64,${base64}" alt="Sección ${i + 1}" />
      </div>
    `).join('');
    
    const compositeHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background: #0f172a; 
      margin: 0;
    }
    .page {
      width: 210mm;
      padding: 3mm 4mm;
      page-break-after: always;
      break-after: page;
      background: #0f172a;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }
    .page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .page img {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 2mm;
    }
  </style>
</head>
<body>
  ${imagesHtml}
</body>
</html>`;
    
    // ── Generar PDF desde el HTML compuesto ──
    const pdfPage = await context.newPage();
    await pdfPage.setContent(compositeHtml, { waitUntil: 'load' });
    await pdfPage.waitForTimeout(500);
    
    const pdfBuffer = await pdfPage.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    
    await browser.close();
    browser = null;
    
    // ── Nombre del archivo ──
    const clientData = presentation.clientData as any;
    const companyName = clientData?.client?.company_name 
      || clientData?.account?.Account_Name 
      || 'Cliente';
    const quoteNumber = clientData?.quote?.number 
      || clientData?.quote?.Quote_Number 
      || '';
    
    const safeCompanyName = companyName.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').replace(/\s+/g, '_');
    const fileName = `Presentacion_Gard_${safeCompanyName}${quoteNumber ? `_${quoteNumber}` : ''}.pdf`;
    
    console.log(`[PDF] Presentación generada: ${fileName} (${Math.round(pdfBuffer.length / 1024)}KB, ${screenshots.length} secciones)`);
    
    const uint8Array = new Uint8Array(pdfBuffer);
    
    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
    
  } catch (error: any) {
    console.error('[PDF] Error generando presentación:', error);
    
    if (browser) {
      try { await browser.close(); } catch {}
    }
    
    return NextResponse.json(
      { error: 'Error generando PDF de la presentación', details: error.message },
      { status: 500 }
    );
  }
}
