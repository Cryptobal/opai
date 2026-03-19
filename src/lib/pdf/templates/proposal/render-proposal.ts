/**
 * Render Propuesta Técnica PDF using Playwright (HTML → PDF).
 * Replaces previous @react-pdf/renderer approach.
 */

import type { ProposalProps } from './build-proposal-props';

export async function renderProposalToBuffer(
  quotationId: string,
  tenantId: string
): Promise<Buffer> {
  const { buildProposalProps } = await import('./build-proposal-props');
  const props = await buildProposalProps(quotationId, tenantId);
  return renderProposalToBufferFromProps(props);
}

export async function renderProposalToBufferFromProps(props: ProposalProps): Promise<Buffer> {
  const { renderProposalHTML } = await import('./render-proposal-html');
  const { chromium } = await import('playwright-core');
  const chromiumPkg = (await import('@sparticuz/chromium')).default;

  const html = renderProposalHTML(props);

  const isDev = process.env.NODE_ENV === 'development';
  const executablePath = isDev
    ? undefined
    : await chromiumPkg.executablePath();

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

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
