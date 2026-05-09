/**
 * Notificaciones al super-admin de la plataforma.
 *
 * Eventos soportados:
 *   - signup_pending: nuevo PendingSignup creado (esperando verificación email)
 *   - signup_verified: PendingSignup -> Tenant provisionado exitosamente
 *   - signup_failed: PendingSignup falló al provisionar (race, BD error)
 *
 * Canales: email (siempre). Slack: futuro (cuando se configure
 * PLATFORM_ALERTS_SLACK_WEBHOOK).
 *
 * Recipient: env PLATFORM_ALERTS_EMAIL (default: carlos.irigoyen@opai.cl).
 */
import { resend, buildDeliverabilityHeaders } from "@/lib/resend";
import { render } from "@react-email/render";
import PlatformAlertEmail from "@/emails/PlatformAlertEmail";

export type PlatformAlertEvent =
  | "signup_pending"
  | "signup_verified"
  | "signup_failed";

export interface PlatformAlertSiiData {
  fechaInicioActividades?: string;
  esEmpresaMenorTamano?: boolean;
  actividadesEconomicas?: Array<{ codigo: string; descripcion: string }>;
}

export interface PlatformAlertData {
  event: PlatformAlertEvent;
  // Owner
  ownerEmail: string;
  ownerName: string;
  ownerPhone?: string | null;
  // Empresa
  commercialName: string;
  legalName?: string | null;
  companyRut?: string | null;
  industry?: string | null;
  estimatedGuards?: string | null;
  address?: string | null;
  commune?: string | null;
  city?: string | null;
  giro?: string | null;
  // SII enrichment
  siiData?: PlatformAlertSiiData | null;
  // Tracking
  source?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  utmMedium?: string | null;
  ip?: string | null;
  // Tenant ya creado (sólo para signup_verified)
  tenantSlug?: string | null;
  tenantUrl?: string | null;
  platformAdminUrl?: string | null;
  // Failure detail
  errorMessage?: string | null;
}

function getRecipient(): string {
  return process.env.PLATFORM_ALERTS_EMAIL || "carlos.irigoyen@opai.cl";
}

function getSubject(data: PlatformAlertData): string {
  const sizeBadge = data.estimatedGuards ? ` · ${data.estimatedGuards}` : "";
  switch (data.event) {
    case "signup_pending":
      return `Nuevo registro Opai — ${data.commercialName}${sizeBadge} (esperando verificación)`;
    case "signup_verified":
      return `Tenant activado — ${data.commercialName}${sizeBadge}`;
    case "signup_failed":
      return `Falló provisioning — ${data.commercialName}: ${data.errorMessage ?? "error desconocido"}`;
  }
}

export async function notifyPlatform(data: PlatformAlertData): Promise<void> {
  const to = getRecipient();
  const subject = getSubject(data);

  try {
    const html = await render(PlatformAlertEmail(data));
    const text = await render(PlatformAlertEmail(data), { plainText: true });

    await resend.emails.send({
      from: "Opai Platform <noreply@opai.cl>",
      to,
      replyTo: "hola@opai.cl",
      subject,
      html,
      text,
      headers: buildDeliverabilityHeaders(),
    });
  } catch (error) {
    console.error("[notify-platform] Error sending alert:", error, {
      event: data.event,
      owner: data.ownerEmail,
    });
    // No re-throw — esto NO debe bloquear el flujo de signup del usuario
  }
}
