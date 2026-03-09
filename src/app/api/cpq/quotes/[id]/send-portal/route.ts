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
 */

import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import { prisma } from "@/lib/prisma";
import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { PortalProspectoInviteEmail } from "@/emails/PortalProspectoInviteEmail";
import bcrypt from "bcryptjs";

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

    // 2. Fetch quote with deal, account, contact, installation
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        positions: {
          include: { puestoTrabajo: true },
        },
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

    if (!account.rut) {
      return NextResponse.json(
        { success: false, error: "La cuenta no tiene RUT. Agrega el RUT antes de enviar por portal." },
        { status: 400 }
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
      pin = String(Math.floor(100000 + Math.random() * 900000));
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
      pin = contact.portalPinVisible || "******";
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
    try {
      const costs = await computeCpqQuoteCosts(id);
      monthlyTotal = costs.monthlyTotal;
    } catch {}

    // 7. Send portal invite email with PIN
    const portalUrl =
      `${process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl"}/portal/cliente`;
    const contactName = `${contact.firstName} ${contact.lastName}`.trim();

    const emailHtml = await render(
      PortalProspectoInviteEmail({
        contactName,
        companyName: account.name,
        rut: account.rut,
        pin,
        portalUrl,
        ejecutivoName,
      })
    );

    const emailResult = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: contact.email,
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
