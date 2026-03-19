/**
 * Render Propuesta Técnica PDF using Playwright (HTML → PDF).
 * Headers/footers via Playwright displayHeaderFooter (not CSS Paged Media).
 */

import type { ProposalProps } from './build-proposal-props';
import { readFileSync, readdirSync } from 'fs';
import * as path from 'path';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderProposalToBuffer(
  quotationId: string,
  tenantId: string
): Promise<Buffer> {
  const { buildProposalProps } = await import('./build-proposal-props');
  const props = await buildProposalProps(quotationId, tenantId);
  return renderProposalToBufferFromProps(props);
}

export async function renderProposalToBufferFromProps(
  props: ProposalProps
): Promise<Buffer> {
  const { renderProposalHTML } = await import('./render-proposal-html');
  const { chromium } = await import('playwright-core');
  const chromiumPkg = (await import('@sparticuz/chromium')).default;

  const publicDir = path.join(process.cwd(), 'public');

  const gardLogoSvg = readFileSync(
    path.join(publicDir, 'logo-gard-blanco.svg')
  );
  const gardLogoBase64 = `data:image/svg+xml;base64,${Buffer.from(gardLogoSvg).toString('base64')}`;

  const gardEscudoSvg = readFileSync(
    path.join(publicDir, 'logos/logo-escudo-azul.svg')
  );
  const gardEscudoBase64 = `data:image/svg+xml;base64,${Buffer.from(gardEscudoSvg).toString('base64')}`;

  const clientLogoFiles = readdirSync(publicDir).filter(
    (f) => f.startsWith('clientes_') && /\.(png|webp|jpg|jpeg)$/i.test(f)
  );
  const clientLogos = clientLogoFiles.map((file) => {
    const buffer = readFileSync(path.join(publicDir, file));
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/png';
    return {
      name: file
        .replace('clientes_', '')
        .replace(/\.(png|webp|jpg|jpeg)$/i, ''),
      base64: `data:${mime};base64,${buffer.toString('base64')}`,
    };
  });

  const html = renderProposalHTML(props, {
    gardLogoBase64,
    gardEscudoBase64,
    clientLogos,
  });

  const isDev = process.env.NODE_ENV === 'development';
  const executablePath = isDev ? undefined : await chromiumPkg.executablePath();

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: isDev
      ? ['--no-sandbox', '--disable-setuid-sandbox']
      : chromiumPkg.args,
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.setContent(html, { waitUntil: 'networkidle' });

    const clientLogoHeader = props.companyLogo
      ? `<img src="${esc(props.companyLogo)}" style="height:22px;border-radius:50%;background:white;padding:2px;object-fit:contain;" />`
      : '<span></span>';

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: `<div style="width:100%;height:45px;background:#0f172a;border-bottom:3px solid #e94560;display:flex;align-items:center;justify-content:space-between;padding:0 40px;font-family:Arial,sans-serif;font-size:10px;"><img src="${gardLogoBase64}" style="height:22px;" /><span style="color:white;font-weight:500;">Propuesta Técnica — ${esc(props.companyName)}</span>${clientLogoHeader}</div>`,
      footerTemplate: `<div style="width:100%;height:25px;display:flex;align-items:center;justify-content:space-between;padding:0 40px;font-family:Arial,sans-serif;font-size:7px;color:#94a3b8;border-top:1px solid #e2e8f0;"><span style="opacity:0.7;">Confidencial · N° ${esc(props.quotationCode)}</span><span><span style="color:#e94560;font-size:6px;">●</span> Gard Security · www.gard.cl</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
      margin: { top: '55px', right: '15mm', bottom: '35px', left: '15mm' },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
