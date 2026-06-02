/**
 * sendCompanyPresentation
 *
 * Lógica reutilizable para enviar la Presentación de Empresa del tenant a un
 * contacto del portal (vía CRM/contactos o vía Lead). Se encarga de:
 *  - habilitar el portal (PIN/portalEnabled) si hace falta,
 *  - construir los "beneficios" del email desde el contenido tenant-driven,
 *  - renderizar y enviar el email (Resend) al contacto, con CC y CCO opcionales,
 *  - registrar tracking (CrmCompanyPresentation) y portalInvitationSentAt.
 *
 * Reusada por:
 *  - POST /api/crm/contacts/[id]/send-presentation
 *  - POST /api/crm/leads/[id]/send-presentation  (previo ensureProspectFromLead)
 */
import { render } from "@react-email/render";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import {
  CompanyPresentationEmail,
  type PresentationEmailBenefit,
} from "@/emails/CompanyPresentationEmail";
import { notify } from "@/lib/notifications/notify";
import { buildEmailUrl } from "@/lib/emails/site-url";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { getTenantPresentationContent } from "@/lib/tenant-presentation";
import { normalizeEmailList, normalizeEmailAddress } from "@/lib/email-address";

/** Emoji por `key` de sección para los beneficios del email. */
const SECTION_EMOJI: Record<string, string> = {
  seguridad: "🛡️",
  tecnologia: "💻",
  cumplimiento: "📋",
  diferenciadores: "⭐",
  certificaciones: "🏆",
  portal: "📱",
};

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export class SendPresentationError extends Error {
  constructor(
    message: string,
    readonly code: "contact_not_found" | "missing_email" | "email_failed",
  ) {
    super(message);
    this.name = "SendPresentationError";
  }
}

export interface SendCompanyPresentationInput {
  tenantId: string;
  userId: string;
  contactId: string;
  notes?: string;
  /** Emails en copia (CC). Acepta direcciones sueltas o CSV. */
  cc?: string[];
  /** Emails en copia oculta (CCO/BCC). */
  bcc?: string[];
}

export interface SendCompanyPresentationResult {
  sentTo: string;
  cc: string[];
  bcc: string[];
  emailId: string | null;
  pinGenerated: boolean;
}

/**
 * Construye los 3 beneficios destacados del email a partir del contenido
 * tenant-driven (primeras secciones), con fallback a los defaults del template.
 */
function buildBenefitsFromContent(
  sections: { key: string; title: string; items: string[] }[],
): PresentationEmailBenefit[] | undefined {
  if (!sections || sections.length === 0) return undefined;
  // Priorizar secciones de valor comercial si existen; si no, las 3 primeras.
  const preferredKeys = ["seguridad", "certificaciones", "tecnologia", "diferenciadores"];
  const ordered = [
    ...preferredKeys
      .map((k) => sections.find((s) => s.key === k))
      .filter((s): s is (typeof sections)[number] => Boolean(s)),
    ...sections.filter((s) => !preferredKeys.includes(s.key)),
  ];
  return ordered.slice(0, 3).map((s) => ({
    icon: SECTION_EMOJI[s.key] ?? "✅",
    name: s.title,
    desc: s.items.slice(0, 2).join(". "),
  }));
}

export async function sendCompanyPresentation(
  input: SendCompanyPresentationInput,
): Promise<SendCompanyPresentationResult> {
  const { tenantId, userId, contactId, notes } = input;

  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId },
    include: { account: { select: { name: true } } },
  });
  if (!contact) {
    throw new SendPresentationError("Contacto no encontrado", "contact_not_found");
  }
  const toEmail = contact.email?.trim();
  if (!toEmail) {
    throw new SendPresentationError("El contacto no tiene email", "missing_email");
  }

  // 1. Habilitar portal / PIN si hace falta.
  let portalPinPlain = contact.portalPinVisible ?? null;
  let pinGenerated = false;
  if (!contact.portalEnabled || !portalPinPlain) {
    const pin = generatePin();
    const hashedPin = await bcrypt.hash(pin, 10);
    await prisma.crmContact.update({
      where: { id: contactId },
      data: { portalPin: hashedPin, portalPinVisible: pin, portalEnabled: true },
    });
    portalPinPlain = pin;
    pinGenerated = true;

    void notify({
      tenantId,
      type: "portal_cliente_access_granted",
      audience: "admin",
      title: "Portal del cliente habilitado para presentación",
      body: `Se envió presentación institucional a ${contact.firstName} ${contact.lastName} (${contact.account.name}) — PIN regenerado.`,
      link: `/crm/accounts/${contact.accountId}?tab=portal`,
    });
  }

  // 2. Datos de marca + contenido tenant-driven.
  const [tenantRow, tenantCfg, content, ejecutivo] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
    getTenantCompanyConfig(tenantId),
    getTenantPresentationContent(tenantId),
    prisma.admin.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);

  // Deep-link a la sección Presentación: el prospecto aterriza viviendo el
  // onboarding directamente en la presentación de empresa, no en el dashboard.
  const portalUrl = buildEmailUrl(
    "/portal/cliente?section=presentacion",
    tenantRow?.slug ?? null,
  );
  const ejecutivoName = ejecutivo?.name || "Ejecutivo comercial";
  const contactFullName =
    `${contact.firstName} ${contact.lastName}`.trim() || contact.firstName || "Cliente";
  const benefits = buildBenefitsFromContent(content.sections);

  // 3. CC / BCC saneados (sin duplicar el destinatario).
  const toNorm = normalizeEmailAddress(toEmail);
  const cc = normalizeEmailList(input.cc).filter((e) => e !== toNorm);
  const bcc = normalizeEmailList(input.bcc).filter(
    (e) => e !== toNorm && !cc.includes(e),
  );

  const html = await render(
    CompanyPresentationEmail({
      contactName: contactFullName,
      companyName: contact.account.name,
      email: toEmail,
      pin: portalPinPlain ?? undefined,
      portalUrl,
      ejecutivoName,
      notes,
      brandName: tenantCfg.commercialName,
      logoUrl: tenantCfg.logoUrl || tenantCfg.brandingLogoWhite || "",
      benefits,
    }),
  );

  const emailCfg = await getTenantEmailConfig(tenantId);
  const emailResult = await resend.emails.send({
    from: emailCfg.from,
    replyTo: emailCfg.replyTo,
    to: toEmail,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
    subject: `Presentación institucional — ${tenantCfg.commercialName} · ${contact.account.name}`,
    html,
  });

  if (emailResult.error) {
    console.error("[CRM] sendCompanyPresentation Resend:", emailResult.error);
    throw new SendPresentationError(
      emailResult.error.message || "Resend rechazó el envío",
      "email_failed",
    );
  }

  // 4. Tracking + fecha de invitación.
  const now = new Date();
  const existing = await prisma.crmCompanyPresentation.findFirst({
    where: { contactId, tenantId, status: { in: ["sent", "viewed"] } },
  });
  if (existing) {
    await prisma.crmCompanyPresentation.update({
      where: { id: existing.id },
      data: { sentAt: now, sentById: userId },
    });
  } else {
    await prisma.crmCompanyPresentation.create({
      data: { tenantId, contactId, sentById: userId, status: "sent", sentAt: now },
    });
  }

  try {
    await prisma.crmContact.update({
      where: { id: contactId },
      data: { portalInvitationSentAt: now },
    });
  } catch (e) {
    console.warn("[CRM] sendCompanyPresentation: fecha invitación no actualizada", e);
  }

  return {
    sentTo: toEmail,
    cc,
    bcc,
    emailId: emailResult.data?.id ?? null,
    pinGenerated,
  };
}
