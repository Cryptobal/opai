import { render } from "@react-email/render";
import { resend, buildDeliverabilityHeaders } from "@/lib/resend";
import TenantLifecycleEmail, {
  type TenantLifecycleEmailKind,
} from "@/emails/TenantLifecycleEmail";
import { buildEmailUrl } from "@/lib/emails/site-url";

export async function sendTenantLifecycleEmail(input: {
  to: string[];
  kind: TenantLifecycleEmailKind;
  tenantName: string;
  ownerName: string;
  daysLeft?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const recipients = [...new Set(input.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (recipients.length === 0) {
    return { ok: false, error: "no_recipients" };
  }

  try {
    const props = {
      kind: input.kind,
      tenantName: input.tenantName,
      ownerName: input.ownerName,
      daysLeft: input.daysLeft,
      ctaUrl: buildEmailUrl("/opai/configuracion/mi-plan"),
    };
    const html = await render(TenantLifecycleEmail(props));
    const text = await render(TenantLifecycleEmail(props), { plainText: true });
    const subject =
      input.kind === "trial_expiring"
        ? `Tu trial de OPAI vence ${input.daysLeft === 0 ? "hoy" : `en ${input.daysLeft} día(s)`}`
        : input.kind === "trial_expired"
          ? "Tu trial de OPAI venció — cuenta en solo lectura"
          : "Tu cuenta OPAI fue suspendida";

    await resend.emails.send({
      from: "Opai <noreply@opai.cl>",
      to: recipients,
      replyTo: "hola@opai.cl",
      subject,
      html,
      text,
      headers: buildDeliverabilityHeaders(),
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "email_failed";
    console.error("[lifecycle-email] send failed:", error);
    return { ok: false, error: message };
  }
}
