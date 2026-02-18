/**
 * Webhook: Resend Email Events
 * 
 * POST /api/webhook/resend
 * 
 * Recibe eventos de tracking de Resend:
 * - email.delivered
 * - email.opened
 * - email.clicked
 * - email.bounced
 * - email.complained
 * 
 * Busca en dos entidades:
 * 1. Presentation (emailMessageId) - presentaciones CPQ
 * 2. CrmEmailMessage (resendId) - correos CRM / follow-ups
 * 
 * Documentación: https://resend.com/docs/webhooks
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;

    console.log('📧 Resend webhook recibido:', { type, emailId: data?.email_id });

    const emailId = data?.email_id;
    if (!emailId) {
      console.error('❌ Webhook sin email_id');
      return NextResponse.json(
        { error: 'email_id no proporcionado' },
        { status: 400 }
      );
    }

    // ── 1. Buscar en Presentations ──
    const presentation = await prisma.presentation.findFirst({
      where: { emailMessageId: emailId },
    });

    if (presentation) {
      switch (type) {
        case 'email.delivered':
          await handleEmailDelivered(presentation.id, data);
          break;
        case 'email.opened':
          await handleEmailOpened(presentation.id, data);
          break;
        case 'email.clicked':
          await handleEmailClicked(presentation.id, data);
          break;
        case 'email.bounced':
          await handleEmailBounced(presentation.id, data);
          break;
        case 'email.complained':
          await handleEmailComplained(presentation.id, data);
          break;
        default:
          console.log(`ℹ️ Evento no manejado (presentation): ${type}`);
      }
    }

    // ── 2. Buscar en CRM Email Messages ──
    const crmMessage = await prisma.crmEmailMessage.findFirst({
      where: { resendId: emailId },
    });

    if (crmMessage) {
      switch (type) {
        case 'email.delivered':
          await handleCrmEmailDelivered(crmMessage.id, data);
          break;
        case 'email.opened':
          await handleCrmEmailOpened(crmMessage.id, crmMessage.tenantId, data);
          break;
        case 'email.clicked':
          await handleCrmEmailClicked(crmMessage.id, data);
          break;
        case 'email.bounced':
          await handleCrmEmailBounced(crmMessage.id, data);
          break;
        case 'email.complained':
          await handleCrmEmailComplained(crmMessage.id, data);
          break;
        default:
          console.log(`ℹ️ Evento no manejado (crm): ${type}`);
      }
    }

    if (!presentation && !crmMessage) {
      console.warn('⚠️ Ni presentación ni CRM message encontrado para emailId:', emailId);
    }

    return NextResponse.json({ success: true, type });

  } catch (error: any) {
    console.error('❌ Error en webhook de Resend:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error.message },
      { status: 500 }
    );
  }
}

// ─── HANDLERS DE EVENTOS ───────────────────────────────────

async function handleEmailDelivered(presentationId: string, data: any) {
  try {
    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        deliveredAt: new Date(data.created_at),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'email_delivered',
        entity: 'presentation',
        entityId: presentationId,
        details: {
          emailId: data.email_id,
          timestamp: data.created_at,
        },
      },
    });

    console.log('✅ Email entregado:', presentationId);
  } catch (error) {
    console.error('Error al procesar email.delivered:', error);
  }
}

async function handleEmailOpened(presentationId: string, data: any) {
  try {
    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
      select: { firstOpenedAt: true, openCount: true },
    });

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        firstOpenedAt: presentation?.firstOpenedAt || new Date(data.created_at),
        lastOpenedAt: new Date(data.created_at),
        openCount: { increment: 1 },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'email_opened',
        entity: 'presentation',
        entityId: presentationId,
        details: {
          emailId: data.email_id,
          timestamp: data.created_at,
          openCount: (presentation?.openCount || 0) + 1,
        },
      },
    });

    console.log('👀 Email abierto:', presentationId, `(${(presentation?.openCount || 0) + 1}x)`);
  } catch (error) {
    console.error('Error al procesar email.opened:', error);
  }
}

async function handleEmailClicked(presentationId: string, data: any) {
  try {
    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        clickCount: { increment: 1 },
        lastClickedAt: new Date(data.created_at),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'email_clicked',
        entity: 'presentation',
        entityId: presentationId,
        details: {
          emailId: data.email_id,
          timestamp: data.created_at,
          link: data.link,
        },
      },
    });

    console.log('🖱️ Link clickeado:', presentationId, data.link);
  } catch (error) {
    console.error('Error al procesar email.clicked:', error);
  }
}

async function handleEmailBounced(presentationId: string, data: any) {
  try {
    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        status: 'expired', // Marcar como expirada si rebotó
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'email_bounced',
        entity: 'presentation',
        entityId: presentationId,
        details: {
          emailId: data.email_id,
          timestamp: data.created_at,
          bounceType: data.bounce_type,
        },
      },
    });

    console.log('⚠️ Email rebotado:', presentationId);
  } catch (error) {
    console.error('Error al procesar email.bounced:', error);
  }
}

async function handleEmailComplained(presentationId: string, data: any) {
  try {
    await prisma.auditLog.create({
      data: {
        action: 'email_complained',
        entity: 'presentation',
        entityId: presentationId,
        details: {
          emailId: data.email_id,
          timestamp: data.created_at,
        },
      },
    });

    console.log('🚨 Spam complaint:', presentationId);
  } catch (error) {
    console.error('Error al procesar email.complained:', error);
  }
}

// ─── CRM EMAIL MESSAGE HANDLERS ──────────────────────────

async function handleCrmEmailDelivered(messageId: string, data: any) {
  try {
    await prisma.crmEmailMessage.update({
      where: { id: messageId },
      data: {
        status: 'delivered',
        deliveredAt: new Date(data.created_at),
      },
    });
    console.log('✅ CRM email entregado:', messageId);
  } catch (error) {
    console.error('Error al procesar crm email.delivered:', error);
  }
}

async function handleCrmEmailOpened(messageId: string, tenantId: string, data: any) {
  try {
    const current = await prisma.crmEmailMessage.findUnique({
      where: { id: messageId },
      select: {
        firstOpenedAt: true,
        openCount: true,
        subject: true,
        toEmails: true,
        thread: { select: { dealId: true } },
      },
    });

    await prisma.crmEmailMessage.update({
      where: { id: messageId },
      data: {
        status: 'opened',
        firstOpenedAt: current?.firstOpenedAt || new Date(data.created_at),
        lastOpenedAt: new Date(data.created_at),
        openCount: { increment: 1 },
      },
    });

    if (!current?.firstOpenedAt) {
      try {
        const toEmail = current?.toEmails?.[0] || 'destinatario';
        const { sendNotification } = await import("@/lib/notification-service");
        await sendNotification({
          tenantId,
          type: 'email_opened',
          title: `Correo abierto: ${current?.subject || 'Sin asunto'}`,
          message: `${toEmail} abrió tu correo.`,
          data: {
            emailMessageId: messageId,
            dealId: current?.thread?.dealId || null,
          },
          link: current?.thread?.dealId
            ? `/crm/deals/${current.thread.dealId}`
            : null,
        });
      } catch (e) {
        console.warn("Webhook: failed to create email_opened notification", e);
      }
    }

    console.log('👀 CRM email abierto:', messageId, `(${(current?.openCount || 0) + 1}x)`);
  } catch (error) {
    console.error('Error al procesar crm email.opened:', error);
  }
}

async function handleCrmEmailClicked(messageId: string, data: any) {
  try {
    await prisma.crmEmailMessage.update({
      where: { id: messageId },
      data: {
        status: 'clicked',
        firstClickedAt: (await prisma.crmEmailMessage.findUnique({
          where: { id: messageId },
          select: { firstClickedAt: true },
        }))?.firstClickedAt || new Date(data.created_at),
        clickCount: { increment: 1 },
      },
    });
    console.log('🖱️ CRM link clickeado:', messageId, data.link);
  } catch (error) {
    console.error('Error al procesar crm email.clicked:', error);
  }
}

async function handleCrmEmailBounced(messageId: string, data: any) {
  try {
    await prisma.crmEmailMessage.update({
      where: { id: messageId },
      data: {
        status: 'bounced',
        bouncedAt: new Date(data.created_at),
        bounceType: data.bounce_type || null,
      },
    });
    console.log('⚠️ CRM email rebotado:', messageId);
  } catch (error) {
    console.error('Error al procesar crm email.bounced:', error);
  }
}

async function handleCrmEmailComplained(messageId: string, data: any) {
  try {
    await prisma.crmEmailMessage.update({
      where: { id: messageId },
      data: { status: 'complained' },
    });
    console.log('🚨 CRM spam complaint:', messageId);
  } catch (error) {
    console.error('Error al procesar crm email.complained:', error);
  }
}
