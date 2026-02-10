/**
 * API Route: /api/cron/followup-emails
 * GET - Procesar y enviar correos de seguimiento programados
 *
 * Diseñado para ejecutarse periódicamente vía Vercel Cron (cada hora).
 * Protegido con CRON_SECRET.
 *
 * Flujo:
 * 1. Buscar CrmFollowUpLog pendientes cuyo scheduledAt <= ahora
 * 2. Cargar template del gestor de documentos
 * 3. Resolver tokens con datos del deal/contact
 * 4. Enviar email via Resend
 * 5. Crear notificación interna (con botón WhatsApp)
 * 6. Avanzar etapa del deal si corresponde
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { resolveDocument } from "@/lib/docs/token-resolver";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getWaTemplate } from "@/lib/whatsapp-templates";

/** Convierte Tiptap JSON resuelto a HTML para email */
function tiptapJsonToHtml(doc: any): string {
  if (!doc || !doc.content) return "";

  const renderNode = (node: any): string => {
    if (!node) return "";
    switch (node.type) {
      case "doc":
        return (node.content || []).map(renderNode).join("");
      case "paragraph": {
        const inner = (node.content || []).map(renderNode).join("");
        return inner ? `<p style="margin:0 0 8px;">${inner}</p>` : "<br/>";
      }
      case "heading": {
        const level = node.attrs?.level || 2;
        const inner = (node.content || []).map(renderNode).join("");
        return `<h${level} style="margin:0 0 8px;">${inner}</h${level}>`;
      }
      case "text": {
        let text = (node.text || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        for (const mark of node.marks || []) {
          switch (mark.type) {
            case "bold":
              text = `<strong>${text}</strong>`;
              break;
            case "italic":
              text = `<em>${text}</em>`;
              break;
            case "underline":
              text = `<u>${text}</u>`;
              break;
            case "link":
              text = `<a href="${mark.attrs?.href || "#"}" style="color:#0059A3;">${text}</a>`;
              break;
          }
        }
        return text;
      }
      case "hardBreak":
        return "<br/>";
      default:
        return (node.content || []).map(renderNode).join("");
    }
  };

  return renderNode(doc);
}

/** Genera el HTML por defecto para seguimientos (cuando no hay template configurado) */
function getDefaultFollowUpHtml(
  sequence: number,
  contactName: string,
  dealTitle: string,
  proposalLink: string | null,
  proposalSentDate: string
): string {
  if (sequence === 1) {
    return `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#333;">
        <p>Estimado/a ${contactName},</p>
        <p>Espero que se encuentre bien. Me permito hacer un breve seguimiento respecto a la propuesta que le enviamos el ${proposalSentDate} para <strong>${dealTitle}</strong>.</p>
        <p>Entendemos que este tipo de decisiones requieren análisis, y quedamos a su disposición para resolver cualquier consulta o ajustar la propuesta según sus necesidades.</p>
        ${proposalLink ? `<p>Puede revisar la propuesta completa aquí:<br/><a href="${proposalLink}" style="color:#0059A3;">${proposalLink}</a></p>` : ""}
        <p>Quedo atento a sus comentarios.</p>
        <p>Saludos cordiales</p>
      </div>
    `;
  }

  return `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#333;">
      <p>Hola ${contactName},</p>
      <p>Le escribo nuevamente respecto a la propuesta que le compartimos el ${proposalSentDate} para <strong>${dealTitle}</strong>.</p>
      <p>Nos gustaría saber si ha tenido oportunidad de revisarla y si hay algún aspecto que le gustaría que profundicemos o ajustemos.</p>
      ${proposalLink ? `<p>Le comparto nuevamente el enlace para su comodidad:<br/><a href="${proposalLink}" style="color:#0059A3;">${proposalLink}</a></p>` : ""}
      <p>Si lo prefiere, podemos coordinar una breve llamada para revisar los puntos clave juntos.</p>
      <p>Saludos cordiales</p>
    </div>
  `;
}

export async function GET(request: NextRequest) {
  try {
    // Validate cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const now = new Date();
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // Buscar follow-ups pendientes cuya hora programada ya pasó
    const pendingFollowUps = await prisma.crmFollowUpLog.findMany({
      where: {
        status: "pending",
        scheduledAt: { lte: now },
      },
      include: {
        deal: {
          include: {
            account: true,
            primaryContact: true,
            stage: true,
          },
        },
      },
      take: 50, // Procesar máximo 50 por ejecución
      orderBy: { scheduledAt: "asc" },
    });

    if (pendingFollowUps.length === 0) {
      return NextResponse.json({
        success: true,
        data: { processed: 0, sent: 0, failed: 0, skipped: 0 },
      });
    }

    for (const followUp of pendingFollowUps) {
      try {
        const { deal } = followUp;
        const contact = deal.primaryContact;

        // Validar que el deal sigue abierto
        if (deal.status !== "open") {
          await prisma.crmFollowUpLog.update({
            where: { id: followUp.id },
            data: { status: "cancelled", error: "Deal no está abierto" },
          });
          skippedCount++;
          continue;
        }

        // Validar que el contacto tiene email
        if (!contact?.email) {
          await prisma.crmFollowUpLog.update({
            where: { id: followUp.id },
            data: { status: "failed", error: "Contacto sin email" },
          });
          failedCount++;
          continue;
        }

        // Cargar config del tenant
        const config = await prisma.crmFollowUpConfig.findUnique({
          where: { tenantId: followUp.tenantId },
        });

        // Si el sistema de follow-ups está desactivado, cancelar
        if (config && !config.isActive) {
          await prisma.crmFollowUpLog.update({
            where: { id: followUp.id },
            data: { status: "cancelled", error: "Sistema desactivado" },
          });
          skippedCount++;
          continue;
        }

        // Verificar pauseOnReply: si el deal avanzó más allá de "Segundo seguimiento", cancelar
        if (config?.pauseOnReply) {
          const stage = deal.stage;
          if (stage && !stage.isClosedWon && !stage.isClosedLost && stage.order > 4) {
            await prisma.crmFollowUpLog.update({
              where: { id: followUp.id },
              data: { status: "cancelled", error: "Deal avanzó manualmente" },
            });
            skippedCount++;
            continue;
          }
        }

        // Resolver template o usar default
        const contactName = contact.firstName || "Estimado/a";
        const proposalSentDate = deal.proposalSentAt
          ? format(new Date(deal.proposalSentAt), "d 'de' MMMM 'de' yyyy", { locale: es })
          : "reciente";

        let emailHtml: string;
        let emailSubject: string;

        const templateId =
          followUp.sequence === 1
            ? config?.firstEmailTemplateId
            : config?.secondEmailTemplateId;

        if (templateId) {
          // Cargar template del gestor de documentos
          const template = await prisma.docTemplate.findUnique({
            where: { id: templateId },
          });

          if (template) {
            const entities = {
              account: deal.account,
              contact: contact,
              deal: {
                ...deal,
                proposalSentDate,
              },
            };

            const { resolvedContent } = resolveDocument(template.content, entities);
            emailHtml = tiptapJsonToHtml(resolvedContent);
            emailSubject = `Seguimiento: ${deal.title} - ${deal.account.name}`;
          } else {
            emailHtml = getDefaultFollowUpHtml(
              followUp.sequence,
              contactName,
              deal.title,
              deal.proposalLink,
              proposalSentDate
            );
            emailSubject =
              followUp.sequence === 1
                ? `Seguimiento: ${deal.title} - ${deal.account.name}`
                : `Re: Propuesta ${deal.title} - ${deal.account.name}`;
          }
        } else {
          emailHtml = getDefaultFollowUpHtml(
            followUp.sequence,
            contactName,
            deal.title,
            deal.proposalLink,
            proposalSentDate
          );
          emailSubject =
            followUp.sequence === 1
              ? `Seguimiento: ${deal.title} - ${deal.account.name}`
              : `Re: Propuesta ${deal.title} - ${deal.account.name}`;
        }

        // Cargar firma predeterminada del tenant
        const signature = await prisma.crmEmailSignature.findFirst({
          where: {
            tenantId: followUp.tenantId,
            isDefault: true,
            isActive: true,
          },
        });

        if (signature?.htmlContent) {
          emailHtml += signature.htmlContent;
        }

        // Enviar email via Resend
        const emailResult = await resend.emails.send({
          from: EMAIL_CONFIG.from,
          to: contact.email,
          subject: emailSubject,
          html: emailHtml,
          replyTo: EMAIL_CONFIG.replyTo,
        });

        const resendId =
          emailResult.data && "id" in emailResult.data
            ? emailResult.data.id
            : null;

        // Crear thread y message en CRM
        const thread = await prisma.crmEmailThread.create({
          data: {
            tenantId: followUp.tenantId,
            accountId: deal.accountId,
            contactId: deal.primaryContactId,
            dealId: deal.id,
            subject: emailSubject,
            lastMessageAt: new Date(),
          },
        });

        const message = await prisma.crmEmailMessage.create({
          data: {
            tenantId: followUp.tenantId,
            threadId: thread.id,
            direction: "out",
            fromEmail: EMAIL_CONFIG.from,
            toEmails: [contact.email],
            subject: emailSubject,
            htmlBody: emailHtml,
            sentAt: new Date(),
            createdBy: "system",
            resendId: resendId,
            status: "sent",
            source: "followup",
            followUpLogId: followUp.id,
          },
        });

        // Actualizar follow-up log
        await prisma.crmFollowUpLog.update({
          where: { id: followUp.id },
          data: {
            status: "sent",
            sentAt: new Date(),
            emailMessageId: message.id,
          },
        });

        // Construir mensaje de WhatsApp desde plantilla
        const whatsappEnabled =
          followUp.sequence === 1
            ? config?.whatsappFirstEnabled ?? true
            : config?.whatsappSecondEnabled ?? true;

        const contactPhone = contact.phone?.replace(/\s/g, "").replace(/^\+/, "");
        const waSlug = followUp.sequence === 1 ? "followup_first" : "followup_second";
        const entities = {
          account: deal.account,
          contact: contact as Record<string, unknown>,
          deal: {
            ...deal,
            proposalLink: deal.proposalLink || "",
            proposalSentDate,
          } as Record<string, unknown>,
        };
        const waBody = await getWaTemplate(followUp.tenantId, waSlug, { entities });
        const whatsappMessage = encodeURIComponent(waBody);
        const whatsappUrl =
          whatsappEnabled && contactPhone
            ? `https://wa.me/${contactPhone}?text=${whatsappMessage}`
            : null;

        // Crear notificación
        await prisma.notification.create({
          data: {
            tenantId: followUp.tenantId,
            type: "followup_sent",
            title: `${followUp.sequence === 1 ? "1er" : "2do"} seguimiento enviado: ${deal.account.name}`,
            message: `Se envió el ${followUp.sequence === 1 ? "primer" : "segundo"} seguimiento a ${contact.firstName} ${contact.lastName} por "${deal.title}".`,
            data: {
              dealId: deal.id,
              contactId: contact.id,
              contactPhone: contactPhone || null,
              contactFirstName: contact.firstName,
              proposalLink: deal.proposalLink,
              proposalSentDate,
              dealTitle: deal.title,
              followUpNumber: followUp.sequence,
              whatsappUrl,
              emailMessageId: message.id,
            },
            link: `/crm/deals/${deal.id}`,
          },
        });

        // Avanzar etapa del deal
        if (config?.autoAdvanceStage) {
          const targetStageName =
            followUp.sequence === 1 ? "Primer seguimiento" : "Segundo seguimiento";

          const targetStage = await prisma.crmPipelineStage.findFirst({
            where: {
              tenantId: followUp.tenantId,
              name: targetStageName,
              isActive: true,
            },
          });

          if (targetStage && deal.stageId !== targetStage.id) {
            // Solo avanzar si la etapa actual es anterior
            const currentStage = deal.stage;
            if (currentStage && currentStage.order < targetStage.order) {
              await prisma.crmDeal.update({
                where: { id: deal.id },
                data: { stageId: targetStage.id },
              });

              await prisma.crmDealStageHistory.create({
                data: {
                  tenantId: followUp.tenantId,
                  dealId: deal.id,
                  fromStageId: deal.stageId,
                  toStageId: targetStage.id,
                  changedBy: "system",
                },
              });

              await prisma.crmHistoryLog.create({
                data: {
                  tenantId: followUp.tenantId,
                  entityType: "deal",
                  entityId: deal.id,
                  action: "deal_stage_changed",
                  details: {
                    fromStageId: deal.stageId,
                    toStageId: targetStage.id,
                    automated: true,
                    reason: `Seguimiento #${followUp.sequence} enviado`,
                  },
                  createdBy: "system",
                },
              });
            }
          }
        }

        sentCount++;
        console.log(
          `✅ Follow-up #${followUp.sequence} enviado: ${deal.title} -> ${contact.email}`
        );
      } catch (error) {
        console.error(`❌ Error procesando follow-up ${followUp.id}:`, error);
        await prisma.crmFollowUpLog.update({
          where: { id: followUp.id },
          data: {
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: pendingFollowUps.length,
        sent: sentCount,
        failed: failedCount,
        skipped: skippedCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error in followup emails cron:", error);
    return NextResponse.json(
      { success: false, error: "Cron job failed" },
      { status: 500 }
    );
  }
}
