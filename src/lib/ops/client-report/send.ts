import { sendEmailWithRetry } from "@/lib/email-retry";
import { getTenantEmailConfig } from "@/lib/resend";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import type { DigestReportData, VisitReportData } from "./types";
import { renderDigestPdf, renderVisitReportPdf } from "./render";

function fileBase(kind: "digest" | "visits", periodKey: string): string {
  const safe = periodKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return kind === "digest"
    ? `informe-operativo-${safe}.pdf`
    : `informe-visitas-${safe}.pdf`;
}

async function storePdf(
  buffer: Buffer,
  fileName: string,
  tenantId: string
): Promise<{ storageKey: string; publicUrl: string | null }> {
  try {
    const uploaded = await uploadFile(
      buffer,
      fileName,
      "application/pdf",
      "client-reports",
      tenantId
    );
    return {
      storageKey: uploaded.storageKey,
      publicUrl: uploaded.publicUrl || null,
    };
  } catch (err) {
    console.warn("[ClientReport] R2 upload skipped:", err);
    return { storageKey: "", publicUrl: null };
  }
}

async function persistPortalRow(opts: {
  tenantId: string;
  accountId: string | null;
  installationId: string | null;
  period: string;
  type: "ops_digest" | "supervision_visitas";
  pdfUrl: string | null;
  data: unknown;
  requestedById?: string | null;
  sentAt?: Date | null;
}) {
  if (!opts.accountId) return;
  try {
    await prisma.portalClienteReporte.create({
      data: {
        tenantId: opts.tenantId,
        accountId: opts.accountId,
        installationId: opts.installationId,
        period: opts.period,
        type: opts.type,
        status: "ready",
        pdfUrl: opts.pdfUrl,
        data: opts.data as object,
        requestedById: opts.requestedById ?? undefined,
        generatedAt: new Date(),
        sentAt: opts.sentAt ?? undefined,
      },
    });
  } catch (err) {
    console.warn("[ClientReport] PortalClienteReporte persist skipped:", err);
  }
}

export async function emailPdf(opts: {
  tenantId: string;
  to: string[];
  subject: string;
  html: string;
  filename: string;
  pdf: Buffer;
  purpose: string;
  refId: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (opts.to.length === 0) return { ok: false, error: "Sin destinatarios" };
  const emailCfg = await getTenantEmailConfig(opts.tenantId);
  const result = await sendEmailWithRetry(
    {
      from: emailCfg.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: [
        {
          filename: opts.filename,
          content: opts.pdf,
        },
      ],
    },
    { tenantId: opts.tenantId, purpose: opts.purpose, refId: opts.refId }
  );
  return result.success
    ? { ok: true }
    : { ok: false, error: result.error };
}

export async function buildAndSendVisitReport(opts: {
  tenantId: string;
  userId?: string | null;
  accountId: string;
  installationIds: string[];
  periodKey: string;
  data: VisitReportData;
  to: string[];
}): Promise<{ ok: boolean; error?: string; pdf: Buffer }> {
  const pdf = await renderVisitReportPdf(opts.data);
  const filename = fileBase("visits", opts.periodKey);
  const stored = await storePdf(pdf, filename, opts.tenantId);
  await persistPortalRow({
    tenantId: opts.tenantId,
    accountId: opts.accountId,
    installationId: opts.installationIds.length === 1 ? opts.installationIds[0] : null,
    period: opts.periodKey,
    type: "supervision_visitas",
    pdfUrl: stored.publicUrl,
    data: opts.data,
    requestedById: opts.userId,
    sentAt: opts.to.length ? new Date() : null,
  });
  if (opts.to.length) {
    const sent = await emailPdf({
      tenantId: opts.tenantId,
      to: opts.to,
      subject: `Informe de visitas — ${opts.data.accountName} — ${opts.data.periodLabel}`,
      html: `<p>Adjuntamos el informe de visitas de supervisión correspondiente a <strong>${opts.data.accountName}</strong> (${opts.data.periodLabel}).</p><p>GARD Security</p>`,
      filename,
      pdf,
      purpose: "ops_client_visit_report",
      refId: opts.accountId,
    });
    if (!sent.ok) return { ok: false, error: sent.error, pdf };
    await logAudit({
      tenantId: opts.tenantId,
      userId: opts.userId,
      action: "EXPORT_DATA",
      entity: "ops_client_visit_report",
      entityId: opts.accountId,
      details: { to: opts.to, period: opts.periodKey },
    });
  }
  return { ok: true, pdf };
}

export async function buildAndSendDigest(opts: {
  tenantId: string;
  userId?: string | null;
  installationId: string;
  accountId: string | null;
  periodKey: string;
  data: DigestReportData;
  to: string[];
  isTest?: boolean;
}): Promise<{ ok: boolean; error?: string; pdf: Buffer }> {
  const pdf = await renderDigestPdf(opts.data);
  const filename = fileBase("digest", opts.periodKey);
  const stored = await storePdf(pdf, filename, opts.tenantId);
  await persistPortalRow({
    tenantId: opts.tenantId,
    accountId: opts.accountId,
    installationId: opts.installationId,
    period: opts.periodKey,
    type: "ops_digest",
    pdfUrl: stored.publicUrl,
    data: opts.data,
    requestedById: opts.userId,
    sentAt: opts.to.length ? new Date() : null,
  });
  if (opts.to.length) {
    const prefix = opts.isTest ? "[Prueba] " : "";
    const sent = await emailPdf({
      tenantId: opts.tenantId,
      to: opts.to,
      subject: `${prefix}Informe operativo — ${opts.data.installationName} — ${opts.data.periodLabel}`,
      html: `<p>Adjuntamos el informe operativo de <strong>${opts.data.installationName}</strong> (${opts.data.periodLabel}).</p><p>GARD Security</p>`,
      filename,
      pdf,
      purpose: opts.isTest ? "ops_client_digest_test" : "ops_client_digest",
      refId: opts.installationId,
    });
    if (!sent.ok) return { ok: false, error: sent.error, pdf };
    await logAudit({
      tenantId: opts.tenantId,
      userId: opts.userId,
      action: "EXPORT_DATA",
      entity: "ops_client_digest",
      entityId: opts.installationId,
      details: { to: opts.to, period: opts.periodKey, test: Boolean(opts.isTest) },
    });
  }
  return { ok: true, pdf };
}
