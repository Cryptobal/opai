/**
 * Reusable function to send a quote via the client portal.
 * Extracted from /api/cpq/quotes/[id]/send-portal so it can be called
 * from both the CPQ and the lead approve-and-send flow.
 */

import { render } from "@react-email/render";
import { prisma } from "@/lib/prisma";
import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { mapCpqDataToPresentation } from "@/lib/cpq-mapper";
import { getUfValue } from "@/lib/uf";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { PortalProspectoInviteEmail } from "@/emails/PortalProspectoInviteEmail";
import { buildProposalProps } from "@/lib/pdf/templates/proposal/build-proposal-props";
import { renderProposalToBufferFromProps } from "@/lib/pdf/templates/proposal/render-proposal";
import { buildQuotationProps } from "@/lib/pdf/templates/quotation/build-quotation-props";
import { renderQuotationToBuffer } from "@/lib/pdf/templates/quotation/render-quotation";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { syncLeadOnProposalSent } from "@/lib/crm/sync-lead-on-proposal-sent";
import {
  buildDefaultPortalInviteEmailSubject,
  truncateCustomEmailSubject,
} from "@/lib/cpq-portal-email-subject";
import { buildPortalClienteInviteUrl } from "@/lib/portal-cliente-url";
import { getWaTemplate } from "@/lib/whatsapp-templates";

export interface SendQuoteToPortalOptions {
  quoteId: string;
  tenantId: string;
  userId: string;
  followUp?: { include: boolean; targetStageId: string | null; skipAll?: boolean };
  ccEmails?: string[];
  bccEmails?: string[];
  /** Contacto que recibe la invitación al portal (PIN y correo). Por defecto el de la cotización. */
  recipientContactId?: string;
  /** IDs de contactos adicionales en copia (misma cuenta). */
  ccContactIds?: string[];
  includeProposalPdf?: boolean;
  includeQuotationPdf?: boolean;
  /** IDs de documentos adjuntos de la cotización a incluir en el correo. */
  attachmentIds?: string[];
  /** Asunto del correo; si se omite o va vacío, se usa el asunto por defecto del sistema. */
  emailSubject?: string;
}

export interface SendQuoteToPortalResult {
  emailId: string | null;
  sentTo: string;
  portalUrl: string;
  pinGenerated: boolean;
  proposalLink: string | null;
  whatsappPhone: string | null;
  whatsappMessage: string;
  contactName: string;
}

export async function sendQuoteToPortal(options: SendQuoteToPortalOptions): Promise<SendQuoteToPortalResult> {
  const {
    quoteId,
    tenantId,
    userId,
    followUp,
    ccEmails = [],
    bccEmails = [],
    recipientContactId,
    ccContactIds = [],
    includeProposalPdf = false,
    includeQuotationPdf = false,
    attachmentIds = [],
    emailSubject: emailSubjectOverride,
  } = options;

  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    include: {
      positions: { include: { puestoTrabajo: true } },
      parameters: true,
      installation: true,
    },
  });

  if (!quote) throw new Error("Cotización no encontrada");
  if (!quote.dealId) throw new Error("La cotización debe tener un negocio asignado");
  if (!quote.contactId) throw new Error("La cotización debe tener un contacto asignado");
  if (!quote.accountId) throw new Error("La cotización debe tener una cuenta asignada");

  const effectiveContactId = recipientContactId ?? quote.contactId;

  const contact = await prisma.crmContact.findFirst({
    where: { id: effectiveContactId, tenantId, accountId: quote.accountId },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, portalEnabled: true, portalPin: true, portalPinVisible: true },
  });

  if (!contact?.email) throw new Error("El contacto destinatario no tiene email o no pertenece a la cuenta");

  let mergedCcEmails = [...ccEmails.filter(Boolean)];
  if (ccContactIds.length > 0) {
    const ccRows = await prisma.crmContact.findMany({
      where: {
        tenantId,
        accountId: quote.accountId,
        id: { in: ccContactIds.filter((id) => id !== contact.id) },
      },
      select: { email: true },
    });
    for (const r of ccRows) {
      if (r.email && !mergedCcEmails.includes(r.email)) mergedCcEmails.push(r.email);
    }
  }
  mergedCcEmails = [...new Set(mergedCcEmails)];

  const account = await prisma.crmAccount.findFirst({
    where: { id: quote.accountId, tenantId },
    select: { id: true, name: true, rut: true, status: true, portalEjecutivoId: true },
  });

  if (!account) throw new Error("Cuenta no encontrada");

  const ejecutivo = await prisma.admin.findFirst({
    where: { id: userId, tenantId },
    select: { name: true, email: true, cargo: true },
  });
  const ejecutivoName = ejecutivo?.name || "Ejecutivo Comercial";

  // Decompose admin.name en firstName/lastName para tokens actor.* del registry.
  // El modelo Admin guarda el nombre concatenado; partimos por el primer espacio
  // para dejar los demás tokens en la rama de "apellidos" (p. ej. "Juan Pérez Soto"
  // → firstName="Juan", lastName="Pérez Soto").
  const ejecutivoNameParts = (ejecutivo?.name || "").trim().split(/\s+/);
  const actorEntity = {
    firstName: ejecutivoNameParts[0] || "",
    lastName: ejecutivoNameParts.slice(1).join(" ") || "",
    fullName: ejecutivo?.name || "Ejecutivo Comercial",
    email: ejecutivo?.email || "",
    roleTitle: ejecutivo?.cargo || "",
  };

  // PIN management
  let pin: string;
  if (!contact.portalPin) {
    pin = String(Math.floor(1000 + Math.random() * 9000));
    const pinHash = await bcrypt.hash(pin, 10);
    await prisma.crmContact.updateMany({
      where: { id: contact.id, tenantId },
      data: { portalPin: pinHash, portalPinVisible: pin, portalEnabled: true },
    });
  } else if (contact.portalPinVisible && contact.portalPinVisible.trim().length > 0) {
    pin = contact.portalPinVisible;
  } else {
    pin = String(Math.floor(1000 + Math.random() * 9000));
    const pinHash = await bcrypt.hash(pin, 10);
    await prisma.crmContact.updateMany({
      where: { id: contact.id, tenantId },
      data: { portalPin: pinHash, portalPinVisible: pin },
    });
  }

  // Update account status
  const accountUpdates: Record<string, unknown> = {};
  if (account.status !== "client_active") accountUpdates.status = "prospect";
  accountUpdates.portalEjecutivoId = userId;
  await prisma.crmAccount.updateMany({ where: { id: account.id, tenantId }, data: accountUpdates });

  // Chat channel
  const existingExternal = await prisma.chatChannel.findFirst({
    where: { tenantId, channelType: "EXTERNAL", accountId: account.id, isActive: true, participants: { some: { participantType: "CONTACT", participantId: contact.id } } },
    include: { participants: true },
  });
  const hasEjecutivo = existingExternal?.participants.some((p) => p.participantType === "ADMIN" && p.participantId === userId) ?? false;
  if (!existingExternal) {
    const channelName = `${contact.firstName} ${contact.lastName} · ${account.name}`;
    await prisma.chatChannel.create({
      data: { tenantId, channelType: "EXTERNAL", accountId: account.id, name: channelName, isActive: true, participants: { create: [{ participantType: "ADMIN", participantId: userId }, { participantType: "CONTACT", participantId: contact.id }] } },
    });
  } else if (!hasEjecutivo) {
    await prisma.chatChannelParticipant.create({ data: { channelId: existingExternal.id, participantType: "ADMIN", participantId: userId } });
  }

  // Compute costs
  let monthlyTotal = Number(quote.monthlyCost) || 0;
  let costSummary: Awaited<ReturnType<typeof computeCpqQuoteCosts>> | null = null;
  try {
    costSummary = await computeCpqQuoteCosts(quoteId);
    monthlyTotal = costSummary.monthlyTotal;
  } catch {}

  // URL pública que verá el cliente: Portal del Cliente (no la presentación /p/...).
  // Se calcula acá porque se usa tanto para `deal.proposalLink` (y por extensión en los
  // correos de seguimiento que inyectan {deal.proposalLink}) como para el correo actual.
  const portalUrl = await buildPortalClienteInviteUrl({
    email: contact.email,
    tenantId,
  });

  // Generate Presentation
  let presentationUniqueId: string | null = null;
  try {
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
    const existingPresentation = await prisma.presentation.findFirst({
      where: { quoteId, status: "sent" },
      select: { uniqueId: true },
      orderBy: { createdAt: "desc" },
    });

    if (existingPresentation) {
      presentationUniqueId = existingPresentation.uniqueId;
    } else {
      const template = await prisma.template.findFirst({ where: { slug: "commercial", active: true, tenantId } });
      if (template) {
        const ACCOUNT_LOGO_PREFIX = "[[ACCOUNT_LOGO_URL:";
        const ACCOUNT_LOGO_SUFFIX = "]]";
        const acc = await prisma.crmAccount.findFirst({ where: { id: quote.accountId!, tenantId }, select: { name: true, notes: true, industry: true, segment: true } });
        const deal = quote.dealId ? await prisma.crmDeal.findFirst({ where: { id: quote.dealId, tenantId }, select: { title: true } }) : null;
        const additionalLines = await prisma.cpqQuoteAdditionalLine.findMany({ where: { quoteId }, orderBy: { orden: "asc" } });
        const totalAdditionalLines = additionalLines.reduce((s, l) => s + Number(l.precio), 0);

        let accountLogoUrl: string | null = null;
        if (acc?.notes) {
          const s = acc.notes.indexOf(ACCOUNT_LOGO_PREFIX);
          if (s >= 0) {
            const e = acc.notes.indexOf(ACCOUNT_LOGO_SUFFIX, s);
            if (e >= 0) accountLogoUrl = acc.notes.slice(s + ACCOUNT_LOGO_PREFIX.length, e).trim() || null;
          }
        }
        const companyDescription = acc?.notes ? acc.notes.replace(/\[\[ACCOUNT_LOGO_URL:[^\]]+\]\]\n?/g, "").trim() || undefined : undefined;
        const accountData = acc ? { name: acc.name, logoUrl: accountLogoUrl, companyDescription, industry: acc.industry || undefined, segment: acc.segment || undefined } : null;

        const marginPct = Number(quote.parameters?.marginPct ?? 13) / 100;
        const financialRatePct = Number(quote.parameters?.financialRatePct ?? 2.5);
        const policyRatePct = Number(quote.parameters?.policyRatePct ?? 0);
        const policyContractMonths = Number(quote.parameters?.policyContractMonths ?? 12);
        const policyContractPct = Number(quote.parameters?.policyContractPct ?? 100);
        const contractMonths = Number(quote.parameters?.contractMonths ?? 12);
        const policyFactor = contractMonths > 0 ? (policyContractMonths * (policyContractPct / 100)) / contractMonths : 0;
        const totalGuards = costSummary?.totalGuards ?? quote.positions.reduce((s, p) => s + p.numGuards * (p.numPuestos || 1), 0);
        const baseAdditionalCosts = costSummary ? Math.max(0, (costSummary.monthlyExtras ?? 0) - (costSummary.monthlyFinancial ?? 0) - (costSummary.monthlyPolicy ?? 0)) : 0;

        const positionSalePrices = new Map<string, number>();
        for (const pos of quote.positions) {
          const guards = pos.numGuards * (pos.numPuestos || 1);
          const proportion = totalGuards > 0 ? guards / totalGuards : 0;
          const totalCost = Number(pos.monthlyPositionCost) + baseAdditionalCosts * proportion;
          const bwm = marginPct < 1 ? totalCost / (1 - marginPct) : totalCost;
          positionSalePrices.set(pos.id, bwm + bwm * (financialRatePct / 100) + bwm * (policyRatePct / 100) * policyFactor);
        }

        let salePriceMonthly = 0;
        if (costSummary) {
          const costsBase = costSummary.monthlyPositions + (costSummary.monthlyUniforms ?? 0) + (costSummary.monthlyExams ?? 0) + (costSummary.monthlyMeals ?? 0) + (costSummary.monthlyVehicles ?? 0) + (costSummary.monthlyInfrastructure ?? 0) + (costSummary.monthlyCostItems ?? 0);
          const bwm = marginPct < 1 ? costsBase / (1 - marginPct) : costsBase;
          salePriceMonthly = bwm + (costSummary.monthlyFinancial ?? 0) + (costSummary.monthlyPolicy ?? 0);
        }

        const ufValue = quote.currency === "UF" ? await getUfValue() : undefined;
        const tenantCfg = await getTenantCompanyConfig(tenantId);
        const sessionId = `cpq_${nanoid(16)}`;
        const uniqueId = nanoid(12);

        const payload = mapCpqDataToPresentation(
          {
            includePricing: false, ufValue,
            quote: { id: quote.id, code: quote.code, clientName: quote.clientName, validUntil: quote.validUntil, notes: quote.notes, aiDescription: quote.aiDescription, serviceDetail: quote.serviceDetail, currency: quote.currency },
            positions: quote.positions, account: accountData,
            deal: deal ? { title: deal.title } : null,
            contact: { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: null, roleTitle: null },
            installation: quote.installation, salePriceMonthly, positionSalePrices, siteUrl,
            additionalLines: additionalLines.map((l) => ({ nombre: l.nombre, descripcion: l.descripcion, precio: Number(l.precio), orden: l.orden })),
            totalAdditionalLines,
          },
          sessionId, tenantCfg, "commercial"
        );

        const payloadWithMeta = {
          ...JSON.parse(JSON.stringify(payload)),
          _cpqQuoteId: quote.id, _cpqQuoteCode: quote.code, _cpqDealId: quote.dealId || null,
          contact: { ...payload.contact, First_Name: contact.firstName, Last_Name: contact.lastName, Email: contact.email },
          quote: { ...payload.quote, Subject: `Propuesta de Servicio de Seguridad - ${acc?.name || quote.clientName || "Cliente"}`, Quote_Number: quote.code },
          account: { ...payload.client, Account_Name: acc?.name || quote.clientName || "Cliente" },
        };

        await prisma.presentation.create({
          data: { uniqueId, templateId: template.id, tenantId, clientData: payloadWithMeta, quoteId: quote.id, status: "sent", recipientEmail: contact.email, recipientName: `${contact.firstName} ${contact.lastName}`.trim(), emailSentAt: new Date(), tags: ["cpq", "portal-invite"] },
        });

        // El link público que recibe el cliente (y que se usa en emails/WhatsApp de
        // seguimiento) apunta al Portal del Cliente, no a la presentación interna.
        if (quote.dealId) {
          await prisma.crmDeal.updateMany({ where: { id: quote.dealId, tenantId }, data: { proposalLink: portalUrl } });
        }
        presentationUniqueId = uniqueId;
      }
    }

    // Company presentation
    try {
      const existingCompanyPres = await prisma.crmCompanyPresentation.findFirst({ where: { contactId: contact.id, status: { in: ["sent", "viewed"] } } });
      if (!existingCompanyPres) {
        await prisma.crmCompanyPresentation.create({ data: { tenantId, contactId: contact.id, sentById: userId, status: "sent", sentAt: new Date() } });
      }
    } catch (cpErr) {
      console.error("Error creating CrmCompanyPresentation:", cpErr);
    }
  } catch (presentationError) {
    console.error("Error creating presentation in send-portal:", presentationError);
  }

  // Update quote status + visibilidad en portal del cliente
  await prisma.cpqQuote.updateMany({
    where: { id: quoteId, tenantId },
    data: { status: "sent", visibleInClientPortal: true },
  });

  // Send email
  const tenantConfig = await getTenantCompanyConfig(tenantId);
  const contactName = `${contact.firstName} ${contact.lastName}`.trim();

  /** Nombre manual en CPQ/lead (prioridad) — mismo criterio que el asunto del correo de portal */
  const manualRef = quote.name?.trim() || quote.clientName?.trim() || null;
  const installationLabel = quote.installation?.name?.trim() || null;

  // Mensaje corto que va dentro del email portal (botón "Comunícate por WhatsApp").
  // Resuelto desde DocTemplate del tenant (slug cpq_proposal_short). El seed por
  // defecto produce algo equivalente al texto hardcoded original (con manualRef e
  // installation cuando aplican vía tokens). Si el tenant edita el template, el
  // texto sigue su redacción.
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
        phone: tenantConfig.phone,
        email: tenantConfig.email,
        whatsappLink: tenantConfig.whatsappLink,
      },
    },
  });

  // ⚠️ Fallback de teléfono Gard sigue acá hasta PR5 — no tocar.
  const whatsappBase = (tenantConfig.whatsappLink || "https://wa.me/56968727644").replace(/\?.*$/, "");
  const whatsappUrl = `${whatsappBase}?text=${encodeURIComponent(whatsappMsg)}`;

  const quoteNameForEmail =
    quote.name?.trim() || quote.installation?.name?.trim() || undefined;
  const tenantBrand = tenantConfig.commercialName?.trim() || "OPAI";
  const trimmedEmailSubject = emailSubjectOverride?.trim() ?? "";
  const emailSubject =
    trimmedEmailSubject.length > 0
      ? truncateCustomEmailSubject(trimmedEmailSubject)
      : buildDefaultPortalInviteEmailSubject({
          quoteCode: quote.code,
          quoteName: quote.name,
          installationName: quote.installation?.name,
          tenantBrand,
        });

  const emailHtml = await render(
    PortalProspectoInviteEmail({
      contactName,
      companyName: account.name,
      email: contact.email,
      pin,
      portalUrl,
      ejecutivoName,
      quoteName: quoteNameForEmail,
      quoteCode: quote.code,
      whatsappUrl,
    })
  );

  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  if (includeProposalPdf) {
    try {
      const { fileName: proposalFileName, ...proposalProps } = await buildProposalProps(quoteId, tenantId);
      const proposalBuffer = await renderProposalToBufferFromProps(proposalProps);
      attachments.push({
        filename: proposalFileName,
        content: proposalBuffer,
        contentType: "application/pdf",
      });
    } catch (err) {
      console.warn("[CPQ] Could not generate proposal PDF for portal invite:", err);
    }
  }

  if (includeQuotationPdf) {
    try {
      const { fileName: quotationFileName, ...quotationProps } = await buildQuotationProps(quoteId, tenantId);
      const quotationBuffer = await renderQuotationToBuffer(quotationProps);
      attachments.push({
        filename: quotationFileName,
        content: quotationBuffer,
        contentType: "application/pdf",
      });
    } catch (err) {
      console.warn("[CPQ] Could not generate quotation PDF for portal invite:", err);
    }
  }

  if (attachmentIds.length > 0) {
    const quoteAtts = await prisma.cpqQuoteAttachment.findMany({
      where: { quoteId, id: { in: attachmentIds } },
      select: { fileName: true, mimeType: true, publicUrl: true },
    });
    for (const att of quoteAtts) {
      if (!att.publicUrl) continue;
      try {
        const res = await fetch(att.publicUrl);
        if (!res.ok) continue;
        const buffer = Buffer.from(await res.arrayBuffer());
        attachments.push({
          filename: att.fileName,
          content: buffer,
          contentType: att.mimeType,
        });
      } catch (err) {
        console.warn(`[CPQ] Could not fetch attachment ${att.fileName}:`, err);
      }
    }
  }

  const emailResult = await resend.emails.send({
    from: EMAIL_CONFIG.from,
    to: contact.email,
    cc: [...new Set([tenantConfig.email, ...mergedCcEmails])],
    bcc: bccEmails.length ? bccEmails : undefined,
    replyTo: tenantConfig.emailReplyTo || EMAIL_CONFIG.replyTo,
    subject: emailSubject,
    html: emailHtml,
    ...(attachments.length > 0 && { attachments }),
    tags: [{ name: "type", value: "portal-prospecto-invite" }, { name: "quote", value: quote.code }],
  });

  await prisma.crmContact.updateMany({
    where: { id: contact.id, tenantId },
    data: { portalInvitationSentAt: new Date() },
  });

  // Follow-up handling
  if (quote.dealId) {
    try {
      await prisma.crmDeal.updateMany({
        where: { id: quote.dealId, tenantId },
        data: { proposalSentAt: new Date(), amount: monthlyTotal, totalPuestos: quote.positions.reduce((s, p) => s + p.numGuards * (p.numPuestos || 1), 0) },
      });

      if (followUp?.skipAll) {
        // noop
      } else if (followUp?.include === false) {
        const { cancelPendingFollowUps } = await import("@/lib/followup-scheduler");
        await cancelPendingFollowUps(quote.dealId, "Usuario eligió no incluir seguimiento");
        if (followUp.targetStageId) {
          const targetStage = await prisma.crmPipelineStage.findFirst({ where: { id: followUp.targetStageId, tenantId, isActive: true } });
          if (targetStage) {
            const deal = await prisma.crmDeal.findFirst({ where: { id: quote.dealId, tenantId } });
            if (deal && deal.stageId !== targetStage.id) {
              await prisma.crmDeal.updateMany({ where: { id: deal.id, tenantId }, data: { stageId: targetStage.id } });
              await prisma.crmDealStageHistory.create({ data: { tenantId, dealId: deal.id, fromStageId: deal.stageId, toStageId: targetStage.id, changedBy: userId } });
            }
          }
        }
      } else {
        const { scheduleFollowUps } = await import("@/lib/followup-scheduler");
        await scheduleFollowUps({ tenantId, dealId: quote.dealId });
        const cotizacionStage = await prisma.crmPipelineStage.findFirst({ where: { tenantId, name: "Cotización enviada", isActive: true } });
        if (cotizacionStage) {
          const deal = await prisma.crmDeal.findFirst({ where: { id: quote.dealId, tenantId } });
          if (deal && deal.stageId !== cotizacionStage.id) {
            await prisma.crmDeal.updateMany({ where: { id: deal.id, tenantId }, data: { stageId: cotizacionStage.id } });
            await prisma.crmDealStageHistory.create({ data: { tenantId, dealId: deal.id, fromStageId: deal.stageId, toStageId: cotizacionStage.id, changedBy: userId } });
          }
        }
      }
    } catch (followUpError) {
      console.error("Error scheduling follow-ups from send-portal:", followUpError);
    }
  }

  await syncLeadOnProposalSent({
    tenantId,
    actingUserId: userId,
    dealId: quote.dealId,
    accountId: quote.accountId,
    contactId: quote.contactId,
    createdFromLeadId: quote.createdFromLeadId,
    installationId: quote.installationId,
  });

  // Log
  await prisma.crmHistoryLog.create({
    data: {
      tenantId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote_sent_portal",
      details: {
        to: contact.email,
        contactName,
        quoteCode: quote.code,
        subject: emailSubject,
        emailId: emailResult?.data?.id || null,
        portalUrl,
        method: "portal_prospecto",
      },
      createdBy: userId,
    },
  });

  return {
    emailId: emailResult?.data?.id || null,
    sentTo: contact.email,
    portalUrl,
    pinGenerated: !contact.portalPin,
    // El link de la propuesta hacia el cliente es siempre el Portal del Cliente.
    proposalLink: portalUrl,
    whatsappPhone: normalizePhone(contact.phone),
    whatsappMessage: buildWhatsAppMessage({
      contactName,
      companyName: account.name,
      quoteCode: quote.code,
      manualRef,
      installationName: installationLabel,
      email: contact.email,
      pin,
      portalUrl,
      ejecutivoName,
      brandName: tenantConfig.commercialName,
    }),
    contactName,
  };
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  if (/^9\d{8}$/.test(cleaned)) return `56${cleaned}`;
  if (cleaned.startsWith("+")) return cleaned.slice(1);
  return cleaned;
}

interface WhatsAppMsgParams {
  contactName: string;
  companyName: string;
  quoteCode: string;
  /** Nombre escrito a mano en la cotización (o clientName); si no hay, se usa cuenta en el encabezado */
  manualRef: string | null;
  installationName: string | null;
  email: string;
  pin: string;
  portalUrl: string;
  ejecutivoName: string;
  brandName: string;
}

function buildWhatsAppMessage(params: WhatsAppMsgParams): string {
  const {
    contactName,
    companyName,
    quoteCode,
    manualRef,
    installationName,
    email,
    pin,
    portalUrl,
    ejecutivoName,
    brandName,
  } = params;
  const firstName = contactName.split(" ")[0];
  const headerLines: string[] = [`*Cotización ${quoteCode}*`];
  if (manualRef) {
    headerLines.push(`*Nombre / referencia:* ${manualRef}`);
  } else {
    headerLines.push(`*Cuenta:* ${companyName}`);
  }
  if (installationName) {
    headerLines.push(`*Instalación:* ${installationName}`);
  }
  return [
    ...headerLines,
    "",
    `Hola ${firstName}, qle. Soy *${ejecutivoName}* de *${brandName}*.`,
    "",
    `Te envié por correo una propuesta de seguridad personalizada. En tu portal privado podrás revisar todo el detalle y chatear directamente conmigo.`,
    "",
    `*Ingresa al portal desde este link* (tu correo ya está prellenado):`,
    portalUrl,
    "",
    `*Credenciales de acceso:*`,
    `Correo: ${email}`,
    `PIN: ${pin}`,
    "",
    `Solo ingresa el PIN y listo.`,
    "",
    `¿Quieres que agendemos una llamada para revisarla juntos? Responde aquí.`,
  ].join("\n");
}
