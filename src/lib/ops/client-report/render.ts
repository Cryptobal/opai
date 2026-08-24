/**
 * Render client-report PDFs to a Buffer.
 *
 * Dynamic import of @react-pdf/renderer (ESM-only; require() fails in
 * production) — same approach as quotation/render-quotation.ts.
 */

import type { DigestReportData, VisitReportData } from "./types";

export async function renderVisitReportPdf(data: VisitReportData): Promise<Buffer> {
  const [{ createElement }, { renderToBuffer }, { VisitReportPdf }] = await Promise.all([
    import("react"),
    import("@react-pdf/renderer"),
    import("./pdf"),
  ]);
  const element = createElement(VisitReportPdf, { data });
  const buf = await renderToBuffer(element as never);
  return Buffer.from(buf);
}

export async function renderDigestPdf(data: DigestReportData): Promise<Buffer> {
  const [{ createElement }, { renderToBuffer }, { OpsDigestPdf }] = await Promise.all([
    import("react"),
    import("@react-pdf/renderer"),
    import("./pdf"),
  ]);
  const element = createElement(OpsDigestPdf, { data });
  const buf = await renderToBuffer(element as never);
  return Buffer.from(buf);
}
