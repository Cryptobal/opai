/**
 * Aviso interno al equipo de finanzas cuando el cliente aprueba / observa /
 * agrega una referencia desde la landing pública /cobro/[token].
 *
 * Notificación = email transaccional (kind `dte_client_action_notice`), sin
 * Slack (stretch futuro). Best-effort: nunca rompe la acción del cliente.
 */

import "server-only";
import { sendTenantEmail } from "@/lib/email/send-tenant-email";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { resolveBrandColors } from "@/modules/finance/billing/billing-doc-config.service";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";

export type CobroNoticeAction = "APPROVED" | "REJECTED" | "OC_ADDED";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifyClientAction(params: {
  tenantId: string;
  dteId: string;
  receiverName: string;
  variant: "PROFORMA" | "ESTADO_DE_PAGO";
  action: CobroNoticeAction;
  actorEmail?: string | null;
  ocFolio?: string | null;
  comment?: string | null;
}): Promise<void> {
  try {
    const company = await getTenantCompanyConfig(params.tenantId);
    const to = (company.emailContact || company.email || "").trim();
    if (!to) return;
    const primary = (await resolveBrandColors(params.tenantId)).primary;
    const link = `${getCanonicalSiteUrl()}/finanzas/facturacion/programacion?draft=${params.dteId}`;
    const label = params.variant === "PROFORMA" ? "proforma" : "estado de pago";
    const cliente = escapeHtml(params.receiverName);
    const actor = params.actorEmail ? escapeHtml(params.actorEmail) : null;

    let subject: string;
    let intro: string;
    if (params.action === "APPROVED") {
      subject = `${params.receiverName} aprobó la ${label}`;
      intro = `<strong>${cliente}</strong> aprobó la ${label}${
        params.ocFolio ? ` e ingresó la OC N° ${escapeHtml(params.ocFolio)}` : ""
      }.`;
    } else if (params.action === "REJECTED") {
      subject = `${params.receiverName} solicitó una corrección`;
      intro = `<strong>${cliente}</strong> solicitó una corrección de la ${label}:<br/><em>“${escapeHtml(
        params.comment ?? "",
      )}”</em>`;
    } else {
      subject = `${params.receiverName} agregó una referencia`;
      intro = `<strong>${cliente}</strong> agregó ${
        params.ocFolio ? `la OC N° ${escapeHtml(params.ocFolio)}` : "una referencia"
      } a la ${label}.`;
    }

    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:8px;">
  <div style="border:1px solid ${primary};border-top:4px solid ${primary};border-radius:8px;padding:20px;">
    <h2 style="color:${primary};font-size:18px;margin:0 0 12px;">Confirmación de cobro</h2>
    <p style="font-size:14px;line-height:1.6;margin:0 0 8px;">${intro}</p>
    ${actor ? `<p style="font-size:13px;color:#64748b;margin:0 0 4px;">Confirmado por: ${actor}</p>` : ""}
    <a href="${link}" style="display:inline-block;margin-top:16px;background:${primary};color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;">Ver borrador</a>
  </div>
</div>`;

    await sendTenantEmail({
      tenantId: params.tenantId,
      module: "finance",
      kind: "dte_client_action_notice",
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("[cobro] notifyClientAction failed:", err);
  }
}
