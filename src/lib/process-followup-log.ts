/**
 * Procesa y envía un follow-up (usado por cron y por envío manual)
 */

import { prisma } from "@/lib/prisma";
import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { resolveDocument } from "@/lib/docs/token-resolver";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getWaTemplate } from "@/lib/whatsapp-templates";

function tiptapJsonToHtml(doc: unknown): string {
  const d = doc as { content?: unknown[] } | null;
  if (!d || !d.content) return "";

  const renderNode = (node: unknown): string => {
    if (!node) return "";
    const n = node as { type?: string; content?: unknown[]; text?: string; marks?: { type: string; attrs?: { href?: string } }[]; attrs?: { level?: number } };
    switch (n.type) {
      case "doc":
        return ((n.content || []) as unknown[]).map(renderNode).join("");
      case "paragraph": {
        const inner = ((n.content || []) as unknown[]).map(renderNode).join("");
        return inner ? `<p style="margin:0 0 8px;">${inner}</p>` : "<br/>";
      }
      case "heading": {
        const level = n.attrs?.level || 2;
        const inner = ((n.content || []) as unknown[]).map(renderNode).join("");
        return `<h${level} style="margin:0 0 8px;">${inner}</h${level}>`;
      }
      case "text": {
        let text = (n.text || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        for (const mark of n.marks || []) {
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
        return ((n.content || []) as unknown[]).map(renderNode).join("");
    }
  };

  return renderNode(d);
}

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

  if (sequence === 2) {
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

  return `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#333;">
      <p>Hola ${contactName},</p>
      <p>Este es nuestro último seguimiento respecto a la propuesta enviada el ${proposalSentDate} para <strong>${dealTitle}</strong>.</p>
      <p>Si te interesa continuar, podemos retomar de inmediato con los ajustes necesarios para avanzar.</p>
      ${proposalLink ? `<p>Te comparto nuevamente el enlace:<br/><a href="${proposalLink}" style="color:#0059A3;">${proposalLink}</a></p>` : ""}
      <p>Si no recibimos respuesta, cerraremos este proceso por ahora.</p>
      <p>Saludos cordiales</p>
    </div>
  `;
}

export type ProcessFollowUpResult =
  | { success: true }
  | { success: false; error: string; skipped?: boolean };

/**
 * Procesa y envía un follow-up por ID.
 * Usado por el cron y por el envío manual.
 */
export async function processFollowUpLog(
  followUpLogId: string
): Promise<ProcessFollowUpResult> {
  const followUp = await prisma.crmFollowUpLog.findUnique({
    where: { id: followUpLogId },
    include: {
      deal: {
        include: {
          account: true,
          primaryContact: true,
          stage: true,
        },
      },
    },
  });

  if (!followUp) {
    return { success: false, error: "Seguimiento no encontrado" };
  }

  if (followUp.status !== "pending" && followUp.status !== "paused") {
    return { success: false, error: `Seguimiento ya procesado (estado: ${followUp.status})` };
  }

  const { deal } = followUp;
  const contact = deal.primaryContact;

  if (deal.status !== "open") {
    await prisma.crmFollowUpLog.update({
      where: { id: followUp.id },
      data: { status: "cancelled", error: "Deal no está abierto" },
    });
    return { success: false, error: "Deal no está abierto", skipped: true };
  }

  if (!contact?.email) {
    await prisma.crmFollowUpLog.update({
      where: { id: followUp.id },
      data: { status: "failed", error: "Contacto sin email" },
    });
    return { success: false, error: "Contacto sin email" };
  }

  const config = await prisma.crmFollowUpConfig.findUnique({
    where: { tenantId: followUp.tenantId },
  });

  if (config && !config.isActive) {
    await prisma.crmFollowUpLog.update({
      where: { id: followUp.id },
      data: { status: "cancelled", error: "Sistema desactivado" },
    });
    return { success: false, error: "Sistema de seguimientos desactivado", skipped: true };
  }

  if (config?.pauseOnReply) {
    const stage = deal.stage;
    if (stage && !stage.isClosedWon && !stage.isClosedLost && stage.order > 4) {
      await prisma.crmFollowUpLog.update({
        where: { id: followUp.id },
        data: { status: "cancelled", error: "Deal avanzó manualmente" },
      });
      return { success: false, error: "Deal avanzó manualmente", skipped: true };
    }
  }

  const contactName = contact.firstName || "Estimado/a";
  const proposalSentDate = deal.proposalSentAt
    ? format(new Date(deal.proposalSentAt), "d 'de' MMMM 'de' yyyy", { locale: es })
    : "reciente";

  const templateId =
    followUp.sequence === 1
      ? config?.firstEmailTemplateId
      : followUp.sequence === 2
        ? config?.secondEmailTemplateId
        : config?.thirdEmailTemplateId;

  let emailHtml: string;
  let emailSubject: string;

  if (templateId) {
    const template = await prisma.docTemplate.findUnique({
      where: { id: templateId },
    });

    if (template) {
      const entities = {
        account: deal.account,
        contact: contact,
        deal: { ...deal, proposalSentDate },
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
          : followUp.sequence === 2
            ? `Re: Propuesta ${deal.title} - ${deal.account.name}`
            : `Último seguimiento: ${deal.title} - ${deal.account.name}`;
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
        : followUp.sequence === 2
          ? `Re: Propuesta ${deal.title} - ${deal.account.name}`
          : `Último seguimiento: ${deal.title} - ${deal.account.name}`;
  }

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

  const bcc =
    config?.bccEnabled && config?.bccEmail?.trim()
      ? [config.bccEmail.trim()]
      : undefined;

  const emailResult = await resend.emails.send({
    from: EMAIL_CONFIG.from,
    to: contact.email,
    subject: emailSubject,
    html: emailHtml,
    replyTo: EMAIL_CONFIG.replyTo,
    ...(bcc ? { bcc } : {}),
  });

  const resendId =
    emailResult.data && "id" in emailResult.data
      ? (emailResult.data as { id: string }).id
      : null;

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

  await prisma.crmFollowUpLog.update({
    where: { id: followUp.id },
    data: {
      status: "sent",
      sentAt: new Date(),
      emailMessageId: message.id,
    },
  });

  const whatsappEnabled =
    followUp.sequence === 1
      ? config?.whatsappFirstEnabled ?? true
      : followUp.sequence === 2
        ? config?.whatsappSecondEnabled ?? true
        : config?.whatsappThirdEnabled ?? true;

  const contactPhone = contact.phone?.replace(/\s/g, "").replace(/^\+/, "");
  const waSlug =
    followUp.sequence === 1
      ? "followup_first"
      : followUp.sequence === 2
        ? "followup_second"
        : "followup_third";
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

  try {
    const { sendNotification } = await import("@/lib/notification-service");
    await sendNotification({
      tenantId: followUp.tenantId,
      type: "followup_sent",
      title: `${followUp.sequence === 1 ? "1er" : followUp.sequence === 2 ? "2do" : "3er"} seguimiento enviado: ${deal.account.name}`,
      message: `Se envió el ${followUp.sequence === 1 ? "primer" : followUp.sequence === 2 ? "segundo" : "tercer"} seguimiento a ${contact.firstName} ${contact.lastName} por "${deal.title}".`,
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
    });
  } catch (e) {
    console.warn("Followup: failed to create notification", e);
  }

  if (config?.autoAdvanceStage) {
    if (followUp.sequence === 3) {
      const lostStage = await prisma.crmPipelineStage.findFirst({
        where: {
          tenantId: followUp.tenantId,
          isActive: true,
          isClosedLost: true,
        },
        orderBy: { order: "asc" },
      });

      if (lostStage && deal.stageId !== lostStage.id) {
        await prisma.crmDeal.update({
          where: { id: deal.id },
          data: {
            stageId: lostStage.id,
            status: "lost",
          },
        });

        await prisma.crmDealStageHistory.create({
          data: {
            tenantId: followUp.tenantId,
            dealId: deal.id,
            fromStageId: deal.stageId,
            toStageId: lostStage.id,
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
              toStageId: lostStage.id,
              automated: true,
              reason: "3er seguimiento enviado: cierre automático como perdido",
            },
            createdBy: "system",
          },
        });
      }

      await prisma.crmFollowUpLog.updateMany({
        where: {
          dealId: deal.id,
          tenantId: followUp.tenantId,
          status: { in: ["pending", "paused"] },
          id: { not: followUp.id },
        },
        data: {
          status: "cancelled",
          error: "Cierre automático tras 3er seguimiento",
        },
      });
    } else {
      const configuredStageId =
        followUp.sequence === 1
          ? config?.firstFollowUpStageId
          : config?.secondFollowUpStageId;

      const fallbackNames =
        followUp.sequence === 1 ? ["Primer seguimiento"] : ["Segundo seguimiento", "2do seguimiento"];

      const targetStage = configuredStageId
        ? await prisma.crmPipelineStage.findFirst({
            where: {
              id: configuredStageId,
              tenantId: followUp.tenantId,
              isActive: true,
            },
          })
        : await prisma.crmPipelineStage.findFirst({
            where: {
              tenantId: followUp.tenantId,
              name: { in: fallbackNames },
              isActive: true,
            },
          });

      if (targetStage && deal.stageId !== targetStage.id) {
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

  console.log(
    `✅ Follow-up #${followUp.sequence} enviado: ${deal.title} -> ${contact.email}`
  );

  return { success: true };
}
