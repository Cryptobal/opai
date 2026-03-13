/**
 * API Route: /api/cpq/quotes/[id]/send-portal
 * POST - Send quote via Portal del Cliente with auto-prospect setup
 *
 * Does everything send-email does PLUS:
 * 1. Sets account.status = "prospect" (if not already "client_active")
 * 2. Sets account.portalEjecutivoId = current user id
 * 3. If contact doesn't have portalPin -> generate 6-digit PIN, hash with bcrypt, set portalEnabled = true
 * 4. Sends email with RUT + PIN + portal link using PortalProspectoInviteEmail template
 * 5. Updates quote status to "sent" and deal fields
 * 6. Creates a Presentation (status "sent") so the prospect sees "Ver propuesta técnica"
 */

import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import { prisma } from "@/lib/prisma";
import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { mapCpqDataToPresentation } from "@/lib/cpq-mapper";
import { getUfValue } from "@/lib/uf";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { PortalProspectoInviteEmail } from "@/emails/PortalProspectoInviteEmail";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Auth check (same as send-email)
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    // Parse optional body (follow-up decision)
    const body = await _request.json().catch(() => ({}));
    const followUpDecision = (body?.followUp as { include: boolean; targetStageId: string | null } | undefined);
    const ccEmails: string[] = Array.isArray(body?.ccEmails) ? body.ccEmails.filter(Boolean) : [];
    const bccEmails: string[] = Array.isArray(body?.bccEmails) ? body.bccEmails.filter(Boolean) : [];

    // 2. Fetch quote with deal, account, contact, installation
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        positions: {
          include: { puestoTrabajo: true },
        },
        parameters: true,
        installation: true,
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotizacion no encontrada" },
        { status: 404 }
      );
    }

    // Validate required CRM context
    if (!quote.dealId) {
      return NextResponse.json(
        { success: false, error: "La cotizacion debe tener un negocio asignado" },
        { status: 400 }
      );
    }
    if (!quote.contactId) {
      return NextResponse.json(
        { success: false, error: "La cotizacion debe tener un contacto asignado" },
        { status: 400 }
      );
    }
    if (!quote.accountId) {
      return NextResponse.json(
        { success: false, error: "La cotizacion debe tener una cuenta asignada" },
        { status: 400 }
      );
    }

    // Fetch contact
    const contact = await prisma.crmContact.findUnique({
      where: { id: quote.contactId },
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

    if (!contact?.email) {
      return NextResponse.json(
        { success: false, error: "El contacto no tiene email" },
        { status: 400 }
      );
    }

    // Fetch account
    const account = await prisma.crmAccount.findUnique({
      where: { id: quote.accountId },
      select: { id: true, name: true, rut: true, status: true, portalEjecutivoId: true },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    // Get ejecutivo name for the email template
    const ejecutivo = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });
    const ejecutivoName = ejecutivo?.name || "Ejecutivo Comercial";

    // 3. Generate PIN if contact doesn't have one
    let pin: string;
    if (!contact.portalPin) {
      pin = String(Math.floor(1000 + Math.random() * 9000));
      const pinHash = await bcrypt.hash(pin, 10);

      await prisma.crmContact.update({
        where: { id: contact.id },
        data: {
          portalPin: pinHash,
          portalPinVisible: pin,
          portalEnabled: true,
        },
      });
    } else {
      // Contact already has a PIN — use the visible one
      pin = contact.portalPinVisible || "****";
    }

    // 5. Update account: status = 'prospect' (if not active), portalEjecutivoId
    const accountUpdates: Record<string, unknown> = {};
    if (account.status !== "client_active") {
      accountUpdates.status = "prospect";
    }
    if (!account.portalEjecutivoId) {
      accountUpdates.portalEjecutivoId = ctx.userId;
    }
    if (Object.keys(accountUpdates).length > 0) {
      await prisma.crmAccount.update({
        where: { id: account.id },
        data: accountUpdates,
      });
    }

    // 6. Compute costs (same as send-email)
    let monthlyTotal = Number(quote.monthlyCost) || 0;
    let costSummary: Awaited<ReturnType<typeof computeCpqQuoteCosts>> | null = null;
    try {
      costSummary = await computeCpqQuoteCosts(id);
      monthlyTotal = costSummary.monthlyTotal;
    } catch {}

    // 6b. Generate Presentation (status "sent") so prospect can see "Ver propuesta técnica"
    let presentationUniqueId: string | null = null;
    try {
      const siteUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://opai.gard.cl";

      // Check if there's already a sent presentation for this quote
      const existingPresentation = await prisma.presentation.findFirst({
        where: { quoteId: id, status: "sent" },
        select: { uniqueId: true },
        orderBy: { createdAt: "desc" },
      });

      if (existingPresentation) {
        presentationUniqueId = existingPresentation.uniqueId;
      } else {
        // Build presentation payload (same logic as create-draft)
        const template = await prisma.template.findFirst({
          where: { slug: "commercial", active: true, tenantId: ctx.tenantId },
        });

        if (template) {
          const ACCOUNT_LOGO_PREFIX = "[[ACCOUNT_LOGO_URL:";
          const ACCOUNT_LOGO_SUFFIX = "]]";
          const acc = await prisma.crmAccount.findUnique({
            where: { id: quote.accountId! },
            select: { name: true, notes: true, industry: true, segment: true },
          });
          const deal = quote.dealId
            ? await prisma.crmDeal.findUnique({ where: { id: quote.dealId }, select: { title: true } })
            : null;
          const additionalLines = await prisma.cpqQuoteAdditionalLine.findMany({
            where: { quoteId: id },
            orderBy: { orden: "asc" },
          });
          const totalAdditionalLines = additionalLines.reduce((s, l) => s + Number(l.precio), 0);

          let accountLogoUrl: string | null = null;
          if (acc?.notes) {
            const s = acc.notes.indexOf(ACCOUNT_LOGO_PREFIX);
            if (s >= 0) {
              const e = acc.notes.indexOf(ACCOUNT_LOGO_SUFFIX, s);
              if (e >= 0) accountLogoUrl = acc.notes.slice(s + ACCOUNT_LOGO_PREFIX.length, e).trim() || null;
            }
          }
          const companyDescription = acc?.notes
            ? acc.notes.replace(/\[\[ACCOUNT_LOGO_URL:[^\]]+\]\]\n?/g, "").trim() || undefined
            : undefined;

          const accountData = acc
            ? { name: acc.name, logoUrl: accountLogoUrl, companyDescription, industry: acc.industry || undefined, segment: acc.segment || undefined }
            : null;

          const marginPct = Number(quote.parameters?.marginPct ?? 13) / 100;
          const financialRatePct = Number(quote.parameters?.financialRatePct ?? 2.5);
          const policyRatePct = Number(quote.parameters?.policyRatePct ?? 0);
          const policyContractMonths = Number(quote.parameters?.policyContractMonths ?? 12);
          const policyContractPct = Number(quote.parameters?.policyContractPct ?? 100);
          const contractMonths = Number(quote.parameters?.contractMonths ?? 12);
          const policyFactor = contractMonths > 0 ? (policyContractMonths * (policyContractPct / 100)) / contractMonths : 0;
          const totalGuards = costSummary?.totalGuards ?? quote.positions.reduce((s, p) => s + p.numGuards * (p.numPuestos || 1), 0);
          const baseAdditionalCosts = costSummary
            ? Math.max(0, (costSummary.monthlyExtras ?? 0) - (costSummary.monthlyFinancial ?? 0) - (costSummary.monthlyPolicy ?? 0))
            : 0;

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
          const tenantCfg = await getTenantCompanyConfig(ctx.tenantId);
          const sessionId = `cpq_${nanoid(16)}`;
          const uniqueId = nanoid(12);

          const payload = mapCpqDataToPresentation(
            {
              ufValue,
              quote: {
                id: quote.id,
                code: quote.code,
                clientName: quote.clientName,
                validUntil: quote.validUntil,
                notes: quote.notes,
                aiDescription: quote.aiDescription,
                serviceDetail: quote.serviceDetail,
                currency: quote.currency,
              },
              positions: quote.positions,
              account: accountData,
              deal: deal ? { title: deal.title } : null,
              contact: {
                firstName: contact.firstName,
                lastName: contact.lastName,
                email: contact.email,
                phone: null,
                roleTitle: null,
              },
              installation: quote.installation,
              salePriceMonthly,
              positionSalePrices,
              siteUrl,
              additionalLines: additionalLines.map((l) => ({
                nombre: l.nombre,
                descripcion: l.descripcion,
                precio: Number(l.precio),
                orden: l.orden,
              })),
              totalAdditionalLines,
            },
            sessionId,
            tenantCfg,
            "commercial"
          );

          const payloadWithMeta = {
            ...JSON.parse(JSON.stringify(payload)),
            _cpqQuoteId: quote.id,
            _cpqQuoteCode: quote.code,
            _cpqDealId: quote.dealId || null,
            contact: {
              ...payload.contact,
              First_Name: contact.firstName,
              Last_Name: contact.lastName,
              Email: contact.email,
            },
            quote: {
              ...payload.quote,
              Subject: `Propuesta de Servicio de Seguridad - ${acc?.name || quote.clientName || "Cliente"}`,
              Quote_Number: quote.code,
            },
            account: {
              ...payload.client,
              Account_Name: acc?.name || quote.clientName || "Cliente",
            },
          };

          await prisma.presentation.create({
            data: {
              uniqueId,
              templateId: template.id,
              tenantId: ctx.tenantId,
              clientData: payloadWithMeta,
              quoteId: quote.id,
              status: "sent",
              recipientEmail: contact.email,
              recipientName: `${contact.firstName} ${contact.lastName}`.trim(),
              emailSentAt: new Date(),
              tags: ["cpq", "portal-invite"],
            },
          });

          // Save proposalLink on deal so portal picks it up
          const proposalLink = `${siteUrl}/p/${uniqueId}`;
          if (quote.dealId) {
            await prisma.crmDeal.update({
              where: { id: quote.dealId },
              data: { proposalLink },
            });
          }

          presentationUniqueId = uniqueId;
        }
      }
    } catch (presentationError) {
      console.error("Error creating presentation in send-portal:", presentationError);
      // Non-fatal: portal invite still works without the presentation link
    }

    // 7. Send portal invite email with PIN
    const basePortalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl"}/portal/cliente`;
    const portalUrl = contact.email
      ? `${basePortalUrl}?email=${encodeURIComponent(contact.email)}`
      : basePortalUrl;
    const contactName = `${contact.firstName} ${contact.lastName}`.trim();
    const siteUrl2 = process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl";
    const proposalLinkForEmail = presentationUniqueId ? `${siteUrl2}/p/${presentationUniqueId}` : null;

    const emailHtml = await render(
      PortalProspectoInviteEmail({
        contactName,
        companyName: account.name,
        email: contact.email,
        pin,
        portalUrl,
        ejecutivoName,
        quoteCode: quote.code,
        proposalLink: proposalLinkForEmail,
      })
    );

    const emailResult = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: contact.email,
      cc: [...new Set(["comercial@gard.cl", ...ccEmails])],
      bcc: bccEmails.length ? bccEmails : undefined,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Propuesta comercial para ${account.name} - Gard Security`,
      html: emailHtml,
      tags: [
        { name: "type", value: "portal-prospecto-invite" },
        { name: "quote", value: quote.code },
      ],
    });

    // 8. Update quote status to "sent"
    await prisma.cpqQuote.update({
      where: { id },
      data: { status: "sent" },
    });

    // 9. Update deal (proposalSentAt, amount, totalPuestos, stageId to "Cotizacion enviada")
    if (quote.dealId) {
      try {
        await prisma.crmDeal.update({
          where: { id: quote.dealId },
          data: {
            proposalSentAt: new Date(),
            amount: monthlyTotal,
            totalPuestos: quote.positions.reduce(
              (s, p) => s + p.numGuards * (p.numPuestos || 1),
              0
            ),
          },
        });

        if (followUpDecision?.include === false) {
          // User chose NOT to include follow-up: cancel existing + move to chosen stage
          const { cancelPendingFollowUps } = await import("@/lib/followup-scheduler");
          await cancelPendingFollowUps(quote.dealId, "Usuario eligió no incluir seguimiento");

          if (followUpDecision.targetStageId) {
            const targetStage = await prisma.crmPipelineStage.findFirst({
              where: { id: followUpDecision.targetStageId, tenantId: ctx.tenantId, isActive: true },
            });
            if (targetStage) {
              const deal = await prisma.crmDeal.findFirst({ where: { id: quote.dealId } });
              if (deal && deal.stageId !== targetStage.id) {
                await prisma.crmDeal.update({
                  where: { id: deal.id },
                  data: { stageId: targetStage.id },
                });
                await prisma.crmDealStageHistory.create({
                  data: {
                    tenantId: ctx.tenantId,
                    dealId: deal.id,
                    fromStageId: deal.stageId,
                    toStageId: targetStage.id,
                    changedBy: ctx.userId,
                  },
                });
              }
            }
          }
        } else {
          // Default: schedule follow-ups + move to "Cotización enviada"
          const { scheduleFollowUps } = await import("@/lib/followup-scheduler");
          await scheduleFollowUps({ tenantId: ctx.tenantId, dealId: quote.dealId });

          const cotizacionStage = await prisma.crmPipelineStage.findFirst({
            where: {
              tenantId: ctx.tenantId,
              name: "Cotización enviada",
              isActive: true,
            },
          });
          if (cotizacionStage) {
            const deal = await prisma.crmDeal.findFirst({
              where: { id: quote.dealId },
            });
            if (deal && deal.stageId !== cotizacionStage.id) {
              await prisma.crmDeal.update({
                where: { id: deal.id },
                data: { stageId: cotizacionStage.id },
              });
              await prisma.crmDealStageHistory.create({
                data: {
                  tenantId: ctx.tenantId,
                  dealId: deal.id,
                  fromStageId: deal.stageId,
                  toStageId: cotizacionStage.id,
                  changedBy: ctx.userId,
                },
              });
            }
          }
        }
      } catch (followUpError) {
        console.error("Error scheduling follow-ups from send-portal:", followUpError);
      }
    }

    // 10. Log in CRM history
    await prisma.crmHistoryLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "quote",
        entityId: id,
        action: "quote_sent_portal",
        details: {
          to: contact.email,
          contactName,
          quoteCode: quote.code,
          emailId: emailResult?.data?.id || null,
          portalUrl,
          method: "portal_prospecto",
        },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        emailId: emailResult?.data?.id,
        sentTo: contact.email,
        portalUrl,
        pinGenerated: !contact.portalPin,
        proposalLink: presentationUniqueId
          ? `${process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl"}/p/${presentationUniqueId}`
          : null,
        // Return phone + plain message separately — client builds wa.me URL
        // so the browser's encodeURIComponent preserves emojis correctly
        whatsappPhone: normalizePhone(contact.phone),
        whatsappMessage: buildWhatsAppMessage({
          contactName,
          companyName: account.name,
          email: contact.email,
          pin,
          portalUrl,
          proposalLink: proposalLinkForEmail,
          ejecutivoName,
        }),
      },
    });
  } catch (error) {
    console.error("Error sending CPQ quote via portal:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar por portal" },
      { status: 500 }
    );
  }
}

// ─── Helpers ───────────────────────────────────────────────

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Strip everything except digits and leading +
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  // If starts with 9 (Chilean mobile without country code), prepend +56
  if (/^9\d{8}$/.test(cleaned)) return `56${cleaned}`;
  // If starts with +56 or 56
  if (cleaned.startsWith("+")) return cleaned.slice(1);
  return cleaned;
}

interface WhatsAppMsgParams {
  contactName: string;
  companyName: string;
  email: string;
  pin: string;
  portalUrl: string;
  proposalLink: string | null;
  ejecutivoName: string;
}

function buildWhatsAppMessage(params: WhatsAppMsgParams): string {
  const { contactName, companyName, email, pin, portalUrl, proposalLink, ejecutivoName } = params;
  const firstName = contactName.split(" ")[0];

  const lines = [
    `Hola ${firstName},`,
    ``,
    `Soy *${ejecutivoName}* de *Gard Security*. Te envi\u00e9 por correo una propuesta de seguridad personalizada para *${companyName}*.`,
    ``,
    `*Accede a tu portal privado* donde podr\u00e1s:`,
    `- Revisar tu propuesta en detalle`,
    `- Ver la propuesta t\u00e9cnica completa`,
    `- Chatear directamente conmigo`,
    `- Monitorear el servicio una vez activo`,
    ``,
    `*Correo:* ${email}`,
    `*PIN:* ${pin}`,
    ``,
    `*Ingresar al portal:*`,
    portalUrl,
  ];

  if (proposalLink) {
    lines.push(``, `*Ver propuesta t\u00e9cnica:*`, proposalLink);
  }

  lines.push(``, `\u00bfTienes alguna consulta? Responde aqu\u00ed mismo.`);

  return lines.join("\n");
}
