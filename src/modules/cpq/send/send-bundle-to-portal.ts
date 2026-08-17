/**
 * Envío de propuesta multi-instalación al portal del cliente.
 * Misma semántica que sendQuoteToPortal: un correo + PIN por destinatario,
 * CC/CCO solo en el primer correo, PDF consolidado opcional.
 */

import { render } from "@react-email/render";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendTenantEmail } from "@/lib/email/send-tenant-email";
import { PortalProspectoInviteEmail } from "@/emails/PortalProspectoInviteEmail";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { buildBundleProposalProps } from "@/lib/pdf/templates/proposal/build-bundle-proposal-props";
import { renderProposalToBufferFromProps } from "@/lib/pdf/templates/proposal/render-proposal";
import { buildQuotationProps } from "@/lib/pdf/templates/quotation/build-quotation-props";
import { renderQuotationToBuffer } from "@/lib/pdf/templates/quotation/render-quotation";
import {
  buildDefaultPortalInviteEmailSubject,
  truncateCustomEmailSubject,
} from "@/lib/cpq-portal-email-subject";
import { buildPortalClienteInviteUrl } from "@/lib/portal-cliente-url";
import { getWaTemplate } from "@/lib/whatsapp-templates";
import { syncLeadOnProposalSent } from "@/lib/crm/sync-lead-on-proposal-sent";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { isProposalContentV2 } from "@/lib/cpq/proposal-sections/schema";
import { setProposalDocStatus } from "@/lib/cpq/proposal-sections/ops";
import type { Prisma } from "@prisma/client";

export class SendBundleToPortalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SendBundleToPortalError";
  }
}

export interface SendBundleToPortalOptions {
  bundleId: string;
  tenantId: string;
  userId: string;
  followUp?: { include: boolean; targetStageId: string | null; skipAll?: boolean };
  ccEmails?: string[];
  bccEmails?: string[];
  recipientContactId?: string;
  recipientContactIds?: string[];
  ccContactIds?: string[];
  includeProposalPdf?: boolean;
  includeQuotationPdf?: boolean;
  emailSubject?: string;
}

export interface SendBundleToPortalResult {
  emailId: string | null;
  sentTo: string;
  sentToList: string[];
  portalUrl: string;
  pinGenerated: boolean;
  proposalLink: string | null;
  whatsappPhone: string | null;
  whatsappMessage: string;
  quotesMarkedSent: number;
}

type PortalRecipientContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  portalEnabled: boolean;
  portalPin: string | null;
  portalPinVisible: string | null;
};

async function ensureContactPortalPin(
  contact: PortalRecipientContact,
  tenantId: string,
): Promise<{ pin: string; pinGenerated: boolean }> {
  if (!contact.portalPin) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const pinHash = await bcrypt.hash(pin, 10);
    await prisma.crmContact.updateMany({
      where: { id: contact.id, tenantId },
      data: { portalPin: pinHash, portalPinVisible: pin, portalEnabled: true },
    });
    return { pin, pinGenerated: true };
  }
  if (contact.portalPinVisible && contact.portalPinVisible.trim().length > 0) {
    return { pin: contact.portalPinVisible, pinGenerated: false };
  }
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const pinHash = await bcrypt.hash(pin, 10);
  await prisma.crmContact.updateMany({
    where: { id: contact.id, tenantId },
    data: { portalPin: pinHash, portalPinVisible: pin },
  });
  return { pin, pinGenerated: true };
}

async function ensureExternalChatChannel(args: {
  tenantId: string;
  accountId: string;
  accountName: string;
  userId: string;
  contact: PortalRecipientContact;
}) {
  const { tenantId, accountId, accountName, userId, contact } = args;
  const existingExternal = await prisma.chatChannel.findFirst({
    where: {
      tenantId,
      channelType: "EXTERNAL",
      accountId,
      isActive: true,
      participants: { some: { participantType: "CONTACT", participantId: contact.id } },
    },
    include: { participants: true },
  });
  const hasEjecutivo =
    existingExternal?.participants.some(
      (p) => p.participantType === "ADMIN" && p.participantId === userId,
    ) ?? false;
  if (!existingExternal) {
    await prisma.chatChannel.create({
      data: {
        tenantId,
        channelType: "EXTERNAL",
        accountId,
        name: `${contact.firstName} ${contact.lastName} · ${accountName}`,
        isActive: true,
        participants: {
          create: [
            { participantType: "ADMIN", participantId: userId },
            { participantType: "CONTACT", participantId: contact.id },
          ],
        },
      },
    });
  } else if (!hasEjecutivo) {
    await prisma.chatChannelParticipant.create({
      data: { channelId: existingExternal.id, participantType: "ADMIN", participantId: userId },
    });
  }
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  if (/^9\d{8}$/.test(cleaned)) return `56${cleaned}`;
  if (cleaned.startsWith("+")) return cleaned.slice(1);
  return cleaned;
}

function resendTagValue(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40) || "bundle";
}

export async function sendBundleToPortal(
  options: SendBundleToPortalOptions,
): Promise<SendBundleToPortalResult> {
  const {
    bundleId,
    tenantId,
    userId,
    followUp,
    ccEmails = [],
    bccEmails = [],
    recipientContactId,
    recipientContactIds,
    ccContactIds = [],
    includeProposalPdf = false,
    includeQuotationPdf = false,
    emailSubject: emailSubjectOverride,
  } = options;

  const bundle = await prisma.cpqProposalBundle.findFirst({
    where: { id: bundleId, tenantId },
    include: {
      quotes: {
        where: { includedInProposal: true },
        orderBy: { displayOrder: "asc" },
        select: {
          quoteId: true,
          quote: {
            select: {
              id: true,
              monthlyCost: true,
              createdFromLeadId: true,
              installationId: true,
              positions: { select: { id: true, numGuards: true, numPuestos: true } },
            },
          },
        },
      },
    },
  });

  if (!bundle) throw new SendBundleToPortalError("Propuesta no encontrada");
  if (bundle.quotes.length === 0) {
    throw new SendBundleToPortalError("No hay cotizaciones incluidas para enviar");
  }
  if (!bundle.dealId) {
    throw new SendBundleToPortalError("La propuesta debe tener un negocio asignado");
  }
  if (!bundle.accountId) {
    throw new SendBundleToPortalError("La propuesta debe tener una cuenta asignada");
  }

  const defaultContactId = bundle.contactId;
  const requestedRecipientIds = [
    ...new Set(
      [
        ...(Array.isArray(recipientContactIds) ? recipientContactIds : []),
        ...(recipientContactId ? [recipientContactId] : []),
      ].filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const effectiveRecipientIds =
    requestedRecipientIds.length > 0
      ? requestedRecipientIds
      : defaultContactId
        ? [defaultContactId]
        : [];
  if (effectiveRecipientIds.length === 0) {
    throw new SendBundleToPortalError("Selecciona al menos un contacto destinatario");
  }

  const recipientRows = await prisma.crmContact.findMany({
    where: {
      tenantId,
      accountId: bundle.accountId,
      id: { in: effectiveRecipientIds },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      portalEnabled: true,
      portalPin: true,
      portalPinVisible: true,
    },
  });

  if (recipientRows.length !== effectiveRecipientIds.length) {
    throw new SendBundleToPortalError(
      "Uno o más contactos destinatarios no pertenecen a la cuenta de la propuesta",
    );
  }

  const recipients: PortalRecipientContact[] = [];
  const byId = new Map(recipientRows.map((r) => [r.id, r]));
  for (const id of effectiveRecipientIds) {
    const row = byId.get(id);
    if (!row?.email) {
      throw new SendBundleToPortalError(
        "El contacto destinatario no tiene email o no pertenece a la cuenta",
      );
    }
    recipients.push({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      portalEnabled: row.portalEnabled,
      portalPin: row.portalPin,
      portalPinVisible: row.portalPinVisible,
    });
  }

  const contact = recipients[0]!;
  const recipientIdSet = new Set(recipients.map((r) => r.id));

  let mergedCcEmails = [...ccEmails.filter(Boolean)];
  if (ccContactIds.length > 0) {
    const ccRows = await prisma.crmContact.findMany({
      where: {
        tenantId,
        accountId: bundle.accountId,
        id: { in: ccContactIds.filter((id) => !recipientIdSet.has(id)) },
      },
      select: { email: true },
    });
    for (const r of ccRows) {
      if (r.email && !mergedCcEmails.includes(r.email)) mergedCcEmails.push(r.email);
    }
  }
  const portalEmails = new Set(recipients.map((r) => r.email.toLowerCase()));
  mergedCcEmails = [...new Set(mergedCcEmails)].filter(
    (email) => !portalEmails.has(email.toLowerCase()),
  );

  const account = await prisma.crmAccount.findFirst({
    where: { id: bundle.accountId, tenantId },
    select: { id: true, name: true, status: true, portalEjecutivoId: true },
  });
  if (!account) throw new SendBundleToPortalError("Cuenta no encontrada");

  const ejecutivo = await prisma.admin.findFirst({
    where: { id: userId, tenantId },
    select: { name: true, email: true, cargo: true },
  });
  const ejecutivoName = ejecutivo?.name || "Ejecutivo Comercial";
  const ejecutivoNameParts = (ejecutivo?.name || "").trim().split(/\s+/);
  const actorEntity = {
    firstName: ejecutivoNameParts[0] || "",
    lastName: ejecutivoNameParts.slice(1).join(" ") || "",
    fullName: ejecutivo?.name || "Ejecutivo Comercial",
    email: ejecutivo?.email || "",
    roleTitle: ejecutivo?.cargo || "",
  };

  const recipientPins = new Map<string, string>();
  let anyPinGenerated = false;
  for (const recipient of recipients) {
    const { pin, pinGenerated } = await ensureContactPortalPin(recipient, tenantId);
    recipientPins.set(recipient.id, pin);
    if (pinGenerated) anyPinGenerated = true;
    await ensureExternalChatChannel({
      tenantId,
      accountId: account.id,
      accountName: account.name,
      userId,
      contact: recipient,
    });
  }

  const accountUpdates: Record<string, unknown> = {};
  if (account.status !== "client_active") accountUpdates.status = "prospect";
  accountUpdates.portalEjecutivoId = userId;
  await prisma.crmAccount.updateMany({
    where: { id: account.id, tenantId },
    data: accountUpdates,
  });

  const portalUrl = await buildPortalClienteInviteUrl({
    email: contact.email,
    tenantId,
  });

  if (bundle.dealId) {
    await prisma.crmDeal.updateMany({
      where: { id: bundle.dealId, tenantId },
      data: { proposalLink: portalUrl },
    });
  }

  try {
    const existingCompanyPres = await prisma.crmCompanyPresentation.findFirst({
      where: { contactId: contact.id, status: { in: ["sent", "viewed"] } },
    });
    if (!existingCompanyPres) {
      await prisma.crmCompanyPresentation.create({
        data: {
          tenantId,
          contactId: contact.id,
          sentById: userId,
          status: "sent",
          sentAt: new Date(),
        },
      });
    }
  } catch (cpErr) {
    console.error("[bundle send] CrmCompanyPresentation:", cpErr);
  }

  const tenantConfig = await getTenantCompanyConfig(tenantId);
  const contactName = `${contact.firstName} ${contact.lastName}`.trim();
  const quoteNameForEmail = bundle.name?.trim() || undefined;
  const tenantBrand = tenantConfig.commercialName?.trim() || "OPAI";
  const trimmedEmailSubject = emailSubjectOverride?.trim() ?? "";
  const emailSubject =
    trimmedEmailSubject.length > 0
      ? truncateCustomEmailSubject(trimmedEmailSubject)
      : buildDefaultPortalInviteEmailSubject({
          quoteCode: bundle.code,
          quoteName: bundle.name,
          tenantBrand,
        });

  const hasGuards = bundle.quotes.some((m) => m.quote.positions.length > 0);
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];

  if (includeProposalPdf && hasGuards) {
    try {
      const { fileName, ...proposalProps } = await buildBundleProposalProps(
        bundleId,
        tenantId,
        { pdfMode: "final" },
      );
      const proposalBuffer = await renderProposalToBufferFromProps(proposalProps);
      attachments.push({
        filename: fileName,
        content: proposalBuffer,
        contentType: "application/pdf",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new SendBundleToPortalError(
        `No se pudo generar la propuesta técnica consolidada: ${msg}`,
      );
    }
  }

  if (includeQuotationPdf) {
    for (const member of bundle.quotes) {
      try {
        const { fileName, ...quotationProps } = await buildQuotationProps(
          member.quoteId,
          tenantId,
        );
        const quotationBuffer = await renderQuotationToBuffer(quotationProps);
        attachments.push({
          filename: fileName,
          content: quotationBuffer,
          contentType: "application/pdf",
        });
      } catch (err) {
        console.warn(
          `[bundle send] quotation PDF ${member.quoteId}:`,
          err,
        );
      }
    }
  }

  const whatsappMsg = await getWaTemplate(tenantId, "cpq_proposal_short", {
    entities: {
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        fullName: contactName,
        email: contact.email,
        phone: contact.phone,
      },
      account: { name: account.name },
      quote: { code: bundle.code, name: bundle.name, clientName: account.name },
      actor: actorEntity,
      tenant: {
        commercialName: tenantConfig.commercialName,
        website: tenantConfig.website,
        phone: tenantConfig.phone,
        email: tenantConfig.email,
        whatsappLink: tenantConfig.whatsappLink,
      },
    },
  });

  let whatsappUrl: string | null = null;
  if (tenantConfig.whatsappLink) {
    const whatsappBase = tenantConfig.whatsappLink.replace(/\?.*$/, "");
    whatsappUrl = `${whatsappBase}?text=${encodeURIComponent(whatsappMsg)}`;
  }

  const firstCc = [...new Set([tenantConfig.email, ...mergedCcEmails].filter(Boolean))];
  let firstEmailId: string | null = null;
  const sentToList: string[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i]!;
    const recipientPin = recipientPins.get(recipient.id)!;
    const recipientName = `${recipient.firstName} ${recipient.lastName}`.trim();
    const recipientPortalUrl = await buildPortalClienteInviteUrl({
      email: recipient.email,
      tenantId,
    });

    const portalInviteEmailComponent = PortalProspectoInviteEmail({
      contactName: recipientName,
      companyName: account.name,
      email: recipient.email,
      pin: recipientPin,
      portalUrl: recipientPortalUrl,
      ejecutivoName,
      quoteName: quoteNameForEmail,
      quoteCode: bundle.code,
      whatsappUrl,
    });
    const emailHtml = await render(portalInviteEmailComponent);
    const emailText = await render(portalInviteEmailComponent, { plainText: true });

    const sendResult = await sendTenantEmail({
      tenantId,
      module: "commercial",
      kind: "cpq_portal_invite",
      to: recipient.email,
      cc: i === 0 ? firstCc : undefined,
      bcc: i === 0 ? bccEmails : undefined,
      subject: emailSubject,
      html: emailHtml,
      text: emailText,
      attachments: attachments.length > 0 ? attachments : undefined,
      tags: [
        { name: "type", value: "portal-prospecto-invite" },
        { name: "bundle", value: resendTagValue(bundle.code) },
      ],
    });

    if (i === 0) firstEmailId = sendResult.resendId ?? null;
    sentToList.push(recipient.email);

    await prisma.crmContact.updateMany({
      where: { id: recipient.id, tenantId },
      data: { portalInvitationSentAt: new Date() },
    });
  }

  const quoteIds = bundle.quotes.map((q) => q.quoteId);
  const now = new Date();
  const quoteUpdate: { status: string; visibleInClientPortal?: boolean } = {
    status: "sent",
  };
  if (bundle.visibleInClientPortal === true) {
    quoteUpdate.visibleInClientPortal = true;
  } else if (bundle.visibleInClientPortal === false) {
    quoteUpdate.visibleInClientPortal = false;
  } else {
    quoteUpdate.visibleInClientPortal = true;
  }

  await prisma.cpqQuote.updateMany({
    where: { id: { in: quoteIds }, tenantId },
    data: quoteUpdate,
  });
  // Primer envío: sentAt solo si aún es null (reenvíos no lo sobrescriben).
  await prisma.cpqQuote.updateMany({
    where: { id: { in: quoteIds }, tenantId, sentAt: null },
    data: { sentAt: now },
  });
  await prisma.cpqProposalBundle.update({
    where: { id: bundleId },
    data: { status: "sent", sentAt: now },
  });

  // Misma semántica que cotización individual: marcar propuesta documental
  // como "enviada" para que el badge y PDFs posteriores no digan BORRADOR.
  try {
    const quoteDocs = await prisma.cpqQuote.findMany({
      where: { id: { in: quoteIds }, tenantId },
      select: { id: true, proposalAiContent: true },
    });
    for (const q of quoteDocs) {
      if (!isProposalContentV2(q.proposalAiContent)) continue;
      try {
        const sent = setProposalDocStatus(q.proposalAiContent, "enviada", {
          userId,
        });
        await prisma.cpqQuote.updateMany({
          where: { id: q.id, tenantId },
          data: {
            proposalStatus: "enviada",
            proposalAiContent: sent as unknown as Prisma.InputJsonValue,
          },
        });
      } catch {
        // El envío ya ocurrió; no revertimos por fallo de metadata.
      }
    }
  } catch (err) {
    console.warn("[bundle send] proposalStatus enviada:", err);
  }

  if (bundle.dealId) {
    try {
      const {
        markDealProposalSent,
        advanceDealToQuoteSentStage,
      } = await import("@/lib/crm/advance-deal-on-quote-sent");

      const monthlyTotal = bundle.quotes.reduce(
        (s, m) => s + (Number(m.quote.monthlyCost) || 0),
        0,
      );
      const totalPuestos = bundle.quotes.reduce(
        (s, m) =>
          s +
          m.quote.positions.reduce(
            (ps, p) => ps + p.numGuards * (p.numPuestos || 1),
            0,
          ),
        0,
      );
      await markDealProposalSent({
        db: prisma,
        tenantId,
        dealId: bundle.dealId,
        data: {
          proposalSentAt: now,
          proposalLink: portalUrl,
          amount: monthlyTotal,
          totalPuestos,
          primaryContactId: contact.id,
        },
      });

      if (followUp?.skipAll) {
        // noop
      } else if (followUp?.include === false) {
        const { cancelPendingFollowUps } = await import("@/lib/followup-scheduler");
        await cancelPendingFollowUps(bundle.dealId, "Usuario eligió no incluir seguimiento");
        if (followUp.targetStageId) {
          const deal = await prisma.crmDeal.findFirst({
            where: { id: bundle.dealId, tenantId },
            select: { id: true, stageId: true },
          });
          if (deal) {
            await advanceDealToQuoteSentStage({
              db: prisma,
              tenantId,
              dealId: deal.id,
              fromStageId: deal.stageId,
              changedBy: userId,
              targetStageId: followUp.targetStageId,
            });
          }
        }
      } else {
        const { scheduleFollowUps } = await import("@/lib/followup-scheduler");
        await scheduleFollowUps({ tenantId, dealId: bundle.dealId });
        const deal = await prisma.crmDeal.findFirst({
          where: { id: bundle.dealId, tenantId },
          select: { id: true, stageId: true },
        });
        if (deal) {
          await advanceDealToQuoteSentStage({
            db: prisma,
            tenantId,
            dealId: deal.id,
            fromStageId: deal.stageId,
            changedBy: userId,
          });
        }
      }
    } catch (followUpError) {
      console.error("[bundle send] follow-up:", followUpError);
    }
  }

  const firstQuote = bundle.quotes[0]?.quote;
  await syncLeadOnProposalSent({
    tenantId,
    actingUserId: userId,
    dealId: bundle.dealId,
    accountId: bundle.accountId,
    contactId: contact.id,
    createdFromLeadId: firstQuote?.createdFromLeadId ?? null,
    installationId: firstQuote?.installationId ?? null,
  });

  // La sala de Slack del negocio se abre solo de forma manual desde el detalle
  // del negocio (botón Slack / Integraciones), no al enviar el bundle.

  await createCrmHistoryLog({
    tenantId,
    entityType: "bundle",
    entityId: bundleId,
    action: "bundle_sent",
    details: {
      code: bundle.code,
      sentTo: sentToList.join(", "),
      toList: sentToList,
      contactIds: recipients.map((r) => r.id),
      instalaciones: quoteIds.length,
      emailId: firstEmailId,
      method: "portal_prospecto",
    },
    createdBy: userId,
  });

  const pin = recipientPins.get(contact.id)!;
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
      quote: { code: bundle.code, name: bundle.name, clientName: account.name },
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
    emailId: firstEmailId,
    sentTo: sentToList.join(", "),
    sentToList,
    portalUrl,
    pinGenerated: anyPinGenerated,
    proposalLink: portalUrl,
    whatsappPhone: normalizePhone(contact.phone),
    whatsappMessage,
    quotesMarkedSent: quoteIds.length,
  };
}
