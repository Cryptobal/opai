import { render } from "@react-email/render";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { prisma } from "@/lib/prisma";
import GoogleWorkspaceInviteEmail from "@/emails/GoogleWorkspaceInviteEmail";
import { buildGoogleWorkspaceInviteLinks } from "./invite-links";

export type SendGoogleWorkspaceInviteParams = {
  tenantId: string;
  inviterName: string;
  invitee: { id: string; name: string; email: string };
};

export type SendGoogleWorkspaceInviteResult =
  | { ok: true; links: ReturnType<typeof buildGoogleWorkspaceInviteLinks> }
  | { ok: false; error: string };

/**
 * Envía por Resend una invitación para conectar Gmail, Drive y Calendar
 * con los links absolutos correctos a cada sección de configuración.
 */
export async function sendGoogleWorkspaceInvite(
  params: SendGoogleWorkspaceInviteParams,
): Promise<SendGoogleWorkspaceInviteResult> {
  const { tenantId, inviterName, invitee } = params;
  const email = invitee.email?.trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "El usuario no tiene email" };
  }

  const [cfg, tenant] = await Promise.all([
    getTenantEmailConfig(tenantId),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, slug: true },
    }),
  ]);

  const links = buildGoogleWorkspaceInviteLinks(cfg.tenantSlug ?? tenant?.slug);
  const html = await render(
    GoogleWorkspaceInviteEmail({
      inviterName: inviterName || "Un administrador",
      inviteeName: invitee.name?.trim() || email,
      companyName: tenant?.name || cfg.companyName || "OPAI",
      ...links,
    }),
  );

  try {
    await resend.emails.send({
      from: cfg.from,
      to: email,
      replyTo: cfg.replyTo || undefined,
      subject: `Conectá Gmail, Drive y Calendar en ${tenant?.name || "OPAI"}`,
      html,
    });
  } catch (error) {
    console.error("[google-workspace] invite email failed:", error);
    return { ok: false, error: "No se pudo enviar el correo" };
  }

  return { ok: true, links };
}
