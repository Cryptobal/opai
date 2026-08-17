/**
 * Arma el mensaje WhatsApp (plantilla + PIN + portal) sin reenviar el correo.
 * Usado por el botón "Reenviar por WhatsApp" en cotización y bundle.
 */

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { buildPortalClienteInviteUrl } from "@/lib/portal-cliente-url";
import { getWaTemplate } from "@/lib/whatsapp-templates";

export class PortalWhatsAppShareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalWhatsAppShareError";
  }
}

export type PortalWhatsAppShareResult = {
  whatsappPhone: string | null;
  whatsappMessage: string;
  contactName: string;
  sentTo: string;
  portalUrl: string;
};

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  if (/^9\d{8}$/.test(cleaned)) return `56${cleaned}`;
  if (cleaned.startsWith("+")) return cleaned.slice(1);
  return cleaned;
}

async function ensurePin(args: {
  contactId: string;
  tenantId: string;
  portalPin: string | null;
  portalPinVisible: string | null;
}): Promise<string> {
  const { contactId, tenantId, portalPin, portalPinVisible } = args;
  if (portalPin && portalPinVisible?.trim()) {
    return portalPinVisible.trim();
  }
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const pinHash = await bcrypt.hash(pin, 10);
  await prisma.crmContact.updateMany({
    where: { id: contactId, tenantId },
    data: {
      portalPin: pinHash,
      portalPinVisible: pin,
      portalEnabled: true,
    },
  });
  return pin;
}

export async function buildQuotePortalWhatsAppShare(args: {
  quoteId: string;
  tenantId: string;
  userId: string;
}): Promise<PortalWhatsAppShareResult> {
  const { quoteId, tenantId, userId } = args;

  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      clientName: true,
      contactId: true,
      accountId: true,
      installation: { select: { name: true } },
    },
  });
  if (!quote) throw new PortalWhatsAppShareError("Cotización no encontrada");
  if (!quote.contactId) {
    throw new PortalWhatsAppShareError("Asigna un contacto antes de compartir por WhatsApp");
  }
  if (!quote.accountId) {
    throw new PortalWhatsAppShareError("Asigna una cuenta antes de compartir por WhatsApp");
  }

  const [contact, account, admin, tenantConfig] = await Promise.all([
    prisma.crmContact.findFirst({
      where: { id: quote.contactId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        portalPin: true,
        portalPinVisible: true,
      },
    }),
    prisma.crmAccount.findFirst({
      where: { id: quote.accountId, tenantId },
      select: { name: true },
    }),
    prisma.admin.findFirst({
      where: { id: userId, tenantId },
      select: { name: true, email: true },
    }),
    getTenantCompanyConfig(tenantId),
  ]);

  if (!contact?.email) {
    throw new PortalWhatsAppShareError("El contacto no tiene email");
  }
  if (!account) throw new PortalWhatsAppShareError("Cuenta no encontrada");

  const pin = await ensurePin({
    contactId: contact.id,
    tenantId,
    portalPin: contact.portalPin,
    portalPinVisible: contact.portalPinVisible,
  });
  const portalUrl = await buildPortalClienteInviteUrl({
    email: contact.email,
    tenantId,
  });
  const contactName = `${contact.firstName} ${contact.lastName}`.trim();
  const actorEntity = {
    name: admin?.name ?? null,
    email: admin?.email ?? null,
  };

  const manualRef = quote.name?.trim() || quote.clientName?.trim() || null;
  const installationLabel = quote.installation?.name?.trim() || null;
  const cpqProposalHeaderBlock = [
    `*Propuesta ${quote.code}*`,
    manualRef ? `*Ref:* ${manualRef}` : null,
    installationLabel ? `*Instalación:* ${installationLabel}` : null,
    `*Cuenta:* ${account.name}`,
  ]
    .filter(Boolean)
    .join("\n");

  const whatsappMessage = await getWaTemplate(tenantId, "cpq_proposal_with_credentials", {
    entities: {
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        fullName: contactName,
        email: contact.email,
        phone: contact.phone,
      },
      account: { name: account.name },
      quote: {
        code: quote.code,
        name: quote.name,
        clientName: quote.clientName,
      },
      installation: quote.installation
        ? { name: quote.installation.name }
        : undefined,
      actor: actorEntity,
      tenant: {
        commercialName: tenantConfig.commercialName,
        website: tenantConfig.website,
        whatsappLink: tenantConfig.whatsappLink,
      },
      system: { portalUrl, portalPin: pin },
      blocks: { cpqProposalHeader: cpqProposalHeaderBlock },
    },
  });

  return {
    whatsappPhone: normalizePhone(contact.phone),
    whatsappMessage,
    contactName,
    sentTo: contact.email,
    portalUrl,
  };
}

export async function buildBundlePortalWhatsAppShare(args: {
  bundleId: string;
  tenantId: string;
  userId: string;
}): Promise<PortalWhatsAppShareResult> {
  const { bundleId, tenantId, userId } = args;

  const bundle = await prisma.cpqProposalBundle.findFirst({
    where: { id: bundleId, tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      contactId: true,
      accountId: true,
    },
  });
  if (!bundle) throw new PortalWhatsAppShareError("Propuesta no encontrada");
  if (!bundle.contactId) {
    throw new PortalWhatsAppShareError("Asigna un contacto antes de compartir por WhatsApp");
  }
  if (!bundle.accountId) {
    throw new PortalWhatsAppShareError("Asigna una cuenta antes de compartir por WhatsApp");
  }

  const [contact, account, admin, tenantConfig] = await Promise.all([
    prisma.crmContact.findFirst({
      where: { id: bundle.contactId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        portalPin: true,
        portalPinVisible: true,
      },
    }),
    prisma.crmAccount.findFirst({
      where: { id: bundle.accountId, tenantId },
      select: { name: true },
    }),
    prisma.admin.findFirst({
      where: { id: userId, tenantId },
      select: { name: true, email: true },
    }),
    getTenantCompanyConfig(tenantId),
  ]);

  if (!contact?.email) {
    throw new PortalWhatsAppShareError("El contacto no tiene email");
  }
  if (!account) throw new PortalWhatsAppShareError("Cuenta no encontrada");

  const pin = await ensurePin({
    contactId: contact.id,
    tenantId,
    portalPin: contact.portalPin,
    portalPinVisible: contact.portalPinVisible,
  });
  const portalUrl = await buildPortalClienteInviteUrl({
    email: contact.email,
    tenantId,
  });
  const contactName = `${contact.firstName} ${contact.lastName}`.trim();
  const actorEntity = {
    name: admin?.name ?? null,
    email: admin?.email ?? null,
  };

  const whatsappMessage = await getWaTemplate(tenantId, "cpq_proposal_with_credentials", {
    entities: {
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        fullName: contactName,
        email: contact.email,
        phone: contact.phone,
      },
      account: { name: account.name },
      quote: {
        code: bundle.code,
        name: bundle.name,
        clientName: account.name,
      },
      actor: actorEntity,
      tenant: {
        commercialName: tenantConfig.commercialName,
        website: tenantConfig.website,
        whatsappLink: tenantConfig.whatsappLink,
      },
      system: { portalUrl, portalPin: pin },
      blocks: {
        cpqProposalHeader: `*Propuesta ${bundle.code}*\n*Cuenta:* ${account.name}`,
      },
    },
  });

  return {
    whatsappPhone: normalizePhone(contact.phone),
    whatsappMessage,
    contactName,
    sentTo: contact.email,
    portalUrl,
  };
}

/** URL wa.me lista para abrir en el cliente. */
export function buildWaMeUrl(phone: string | null | undefined, message: string): string {
  const encoded = encodeURIComponent(message);
  const cleaned = phone?.trim() || "";
  return cleaned
    ? `https://wa.me/${cleaned}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}
