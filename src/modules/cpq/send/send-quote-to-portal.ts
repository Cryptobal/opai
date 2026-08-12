/**
 * Reusable function to send a quote via the client portal.
 * Extracted from /api/cpq/quotes/[id]/send-portal so it can be called
 * from both the CPQ and the lead approve-and-send flow.
 */

import { render } from "@react-email/render";
import { prisma } from "@/lib/prisma";
import { sendTenantEmail } from "@/lib/email/send-tenant-email";
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
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { enqueueQuotePdfToDrive } from "@/lib/google-workspace/drive-enqueue-hooks";

export interface SendQuoteToPortalOptions {
  quoteId: string;
  tenantId: string;
  userId: string;
  followUp?: { include: boolean; targetStageId: string | null; skipAll?: boolean };
  ccEmails?: string[];
  bccEmails?: string[];
  /**
   * Contacto que recibe la invitación al portal (PIN y correo).
   * Compat: si también viene `recipientContactIds`, se unifican (sin duplicados).
   * Por defecto el de la cotización.
   */
  recipientContactId?: string;
  /** Varios contactos de la cuenta; cada uno recibe su propio correo + PIN. */
  recipientContactIds?: string[];
  /** IDs de contactos adicionales en copia (misma cuenta). Solo en el primer correo. */
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
  /** Emails unidos por coma (compat). */
  sentTo: string;
  /** Lista de emails a los que se envió invitación. */
  sentToList: string[];
  portalUrl: string;
  pinGenerated: boolean;
  proposalLink: string | null;
  whatsappPhone: string | null;
  whatsappMessage: string;
  contactName: string;
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
    const channelName = `${contact.firstName} ${contact.lastName} · ${accountName}`;
    await prisma.chatChannel.create({
      data: {
        tenantId,
        channelType: "EXTERNAL",
        accountId,
        name: channelName,
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

export async function sendQuoteToPortal(options: SendQuoteToPortalOptions): Promise<SendQuoteToPortalResult> {
  const {
    quoteId,
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

  // Unificar recipientContactIds + recipientContactId (compat). Sin duplicados, orden estable.
  const requestedRecipientIds = [
    ...new Set(
      [
        ...(Array.isArray(recipientContactIds) ? recipientContactIds : []),
        ...(recipientContactId ? [recipientContactId] : []),
      ].filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const effectiveRecipientIds =
    requestedRecipientIds.length > 0 ? requestedRecipientIds : [quote.contactId];

  const recipientRows = await prisma.crmContact.findMany({
    where: {
      tenantId,
      accountId: quote.accountId,
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
    throw new Error("Uno o más contactos destinatarios no pertenecen a la cuenta de la cotización");
  }

  const recipients: PortalRecipientContact[] = [];
  const byId = new Map(recipientRows.map((r) => [r.id, r]));
  for (const id of effectiveRecipientIds) {
    const row = byId.get(id);
    if (!row?.email) {
      throw new Error("El contacto destinatario no tiene email o no pertenece a la cuenta");
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

  // Contacto primario para presentation / WhatsApp / retorno (primer destinatario).
  const contact = recipients[0]!;
  const recipientIdSet = new Set(recipients.map((r) => r.id));

  let mergedCcEmails = [...ccEmails.filter(Boolean)];
  if (ccContactIds.length > 0) {
    const ccRows = await prisma.crmContact.findMany({
      where: {
        tenantId,
        accountId: quote.accountId,
        // No CC a quienes ya reciben invitación con PIN propio.
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

  // PIN + canal chat por cada destinatario (antes de side-effects globales).
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
  const pin = recipientPins.get(contact.id)!;

  // Update account status (una sola vez)
  const accountUpdates: Record<string, unknown> = {};
  if (account.status !== "client_active") accountUpdates.status = "prospect";
  accountUpdates.portalEjecutivoId = userId;
  await prisma.crmAccount.updateMany({ where: { id: account.id, tenantId }, data: accountUpdates });

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
    const siteUrl = getCanonicalSiteUrl();
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
        const baseAdditionalCosts = costSummary
          ? Math.max(
              0,
              (costSummary.monthlyExtras ?? 0) -
                (costSummary.monthlyFinancial ?? 0) -
                (costSummary.monthlyPolicy ?? 0) -
                (costSummary.monthlyPolicyAdmin ?? 0) -
                (costSummary.monthlyLiability ?? 0),
            )
          : 0;

        const positionSalePrices = new Map<string, number>();
        for (const pos of quote.positions) {
          const guards = pos.numGuards * (pos.numPuestos || 1);
          const proportion = totalGuards > 0 ? guards / totalGuards : 0;
          const totalCost = Number(pos.monthlyPositionCost) + baseAdditionalCosts * proportion;
          const bwm = marginPct < 1 ? totalCost / (1 - marginPct) : totalCost;
          positionSalePrices.set(pos.id, bwm + bwm * (financialRatePct / 100) + bwm * (policyRatePct / 100) * policyFactor);
        }

        // Usar baseWithMargin del motor canónico (incluye ajuste de feriados y
        // el modo de margen correcto); recomputar costsBase a mano omitía el
        // feriado y daba un precio menor que el panel.
        let salePriceMonthly = 0;
        if (costSummary) {
          const addl = costSummary.additionalLinesTotalWithMargin ?? 0;
          salePriceMonthly =
            (costSummary.salePriceMonthly ??
              costSummary.baseWithMargin +
                (costSummary.monthlyFinancial ?? 0) +
                (costSummary.monthlyPolicy ?? 0) +
                (costSummary.monthlyPolicyAdmin ?? 0) +
                (costSummary.monthlyLiability ?? 0) +
                addl) - addl;
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

  // El whatsappUrl que va dentro del email del portal solo se construye si
  // el tenant tiene su WhatsApp configurado. Si no, se omite el botón en el
  // email (no caemos al teléfono de otro tenant — fail-loud).
  let whatsappUrl: string | null = null;
  if (tenantConfig.whatsappLink) {
    const whatsappBase = tenantConfig.whatsappLink.replace(/\?.*$/, "");
    whatsappUrl = `${whatsappBase}?text=${encodeURIComponent(whatsappMsg)}`;
  } else {
    console.warn(
      `[whatsapp] Tenant ${tenantId} sin whatsappLink configurado. Email portal sin botón WhatsApp.`,
      { tenantId, quoteId },
    );
  }

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

  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  // La Propuesta Técnica es un dossier del servicio de guardias (dotación,
  // organigrama, SLA en sitio, OS-10, plan de contingencia por inasistencia).
  // En una cotización sin puestos nada de eso existe: el documento le hablaría
  // al cliente de un servicio que no le estamos vendiendo. No se adjunta.
  // PDFs/adjuntos se generan UNA sola vez y se reutilizan en cada correo.
  const proposalPdfApplies = includeProposalPdf && quote.positions.length > 0;
  if (proposalPdfApplies) {
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
      void enqueueQuotePdfToDrive({
        tenantId,
        quoteId,
        pdfBuffer: quotationBuffer,
        fileName: quotationFileName,
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

  // Un correo por destinatario con su PIN/portalUrl. CC/BCC solo en el primero
  // para no filtrar PINs ajenos a terceros en copia.
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

    // Render del email: HTML + versión texto plano. La presencia de `text` mejora
    // el score anti-spam (Gmail/Outlook prefieren multipart/alternative) y permite
    // a clientes que no renderizan HTML (filtros corporativos, screen readers) ver
    // el contenido. La versión plain se genera del mismo componente con
    // `{ plainText: true }` — react-email se encarga de extraer el texto.
    const portalInviteEmailComponent = PortalProspectoInviteEmail({
      contactName: recipientName,
      companyName: account.name,
      email: recipient.email,
      pin: recipientPin,
      portalUrl: recipientPortalUrl,
      ejecutivoName,
      quoteName: quoteNameForEmail,
      quoteCode: quote.code,
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
        { name: "quote", value: quote.code },
      ],
    });

    if (i === 0) firstEmailId = sendResult.resendId ?? null;
    sentToList.push(recipient.email);

    await prisma.crmContact.updateMany({
      where: { id: recipient.id, tenantId },
      data: { portalInvitationSentAt: new Date() },
    });
  }

  const emailResult = { data: { id: firstEmailId } };
  const sentTo = sentToList.join(", ");

  // Follow-up handling
  if (quote.dealId) {
    try {
      const {
        markDealProposalSent,
        advanceDealToQuoteSentStage,
      } = await import("@/lib/crm/advance-deal-on-quote-sent");

      await markDealProposalSent({
        db: prisma,
        tenantId,
        dealId: quote.dealId,
        data: {
          proposalSentAt: new Date(),
          amount: monthlyTotal,
          totalPuestos: quote.positions.reduce(
            (s, p) => s + p.numGuards * (p.numPuestos || 1),
            0,
          ),
          primaryContactId: quote.contactId,
        },
      });

      if (followUp?.skipAll) {
        // noop
      } else if (followUp?.include === false) {
        const { cancelPendingFollowUps } = await import("@/lib/followup-scheduler");
        await cancelPendingFollowUps(quote.dealId, "Usuario eligió no incluir seguimiento");
        if (followUp.targetStageId) {
          const deal = await prisma.crmDeal.findFirst({
            where: { id: quote.dealId, tenantId },
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
        await scheduleFollowUps({ tenantId, dealId: quote.dealId });
        const deal = await prisma.crmDeal.findFirst({
          where: { id: quote.dealId, tenantId },
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

  // Sala de Slack del negocio: al enviar la cotización se abre (o se reutiliza,
  // es idempotente) la sala y se publica el resumen de lo cotizado. Best-effort:
  // un fallo de Slack NUNCA rompe el envío de la cotización.
  if (quote.dealId) {
    try {
      const { openDealRoom } = await import("@/lib/integrations/slack/deal-rooms/room");
      await openDealRoom(tenantId, quote.dealId, userId);
    } catch (dealRoomError) {
      console.error("[slack] openDealRoom on quote sent failed:", dealRoomError);
    }
  }

  // Log
  await prisma.crmHistoryLog.create({
    data: {
      tenantId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote_sent_portal",
      details: {
        to: sentTo,
        toList: sentToList,
        contactIds: recipients.map((r) => r.id),
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

  // Bloque pre-formateado: header del mensaje WA con código de cotización +
  // referencia (manualRef) o cuenta + instalación. El seed `cpq_proposal_with_credentials`
  // referencia este bloque vía `{{blocks.cpqProposalHeader}}`.
  const cpqProposalHeaderBlock = (() => {
    const lines: string[] = [`*Cotización ${quote.code}*`];
    if (manualRef) {
      lines.push(`*Nombre / referencia:* ${manualRef}`);
    } else {
      lines.push(`*Cuenta:* ${account.name}`);
    }
    if (installationLabel) {
      lines.push(`*Instalación:* ${installationLabel}`);
    }
    return lines.join("\n");
  })();

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
      system: {
        portalUrl,
        portalPin: pin,
      },
      blocks: {
        cpqProposalHeader: cpqProposalHeaderBlock,
      },
    },
  });

  // Validar que la plantilla del tenant siga conteniendo los tokens críticos
  // (PIN + portalUrl) tras la resolución. Si alguno falta es porque el tenant
  // editó la plantilla y los borró: el cliente no podrá entrar al portal solo
  // con el WA. NO se bloquea el envío — el PIN llega por email igual — pero
  // se loguea para que ops detecte el problema.
  if (!whatsappMessage.includes(pin) || !whatsappMessage.includes(portalUrl)) {
    console.warn(
      `[whatsapp] Plantilla cpq_proposal_with_credentials del tenant ${tenantId} no contiene tokens críticos. Cliente puede quedar sin PIN/portalUrl en el mensaje WA.`,
      {
        tenantId,
        quoteId,
        hasPin: whatsappMessage.includes(pin),
        hasPortalUrl: whatsappMessage.includes(portalUrl),
      },
    );
  }

  return {
    emailId: emailResult?.data?.id || null,
    sentTo,
    sentToList,
    portalUrl,
    pinGenerated: anyPinGenerated,
    // El link de la propuesta hacia el cliente es siempre el Portal del Cliente.
    proposalLink: portalUrl,
    whatsappPhone: normalizePhone(contact.phone),
    whatsappMessage,
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

