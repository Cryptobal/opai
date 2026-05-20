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
 * Busca en tres entidades:
 * 1. Presentation (emailMessageId) - presentaciones CPQ
 * 2. CrmEmailMessage (resendId) - correos CRM / follow-ups
 * 3. OpsEmailLog (resendId) - onboarding y comunicaciones a guardias
 * 
 * Documentación: https://resend.com/docs/webhooks
 */

import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.text();

    // Verify Resend webhook signature via svix
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    let body: { type: string; data: Record<string, unknown> };

    if (secret) {
      const svixHeaders = {
        'svix-id': req.headers.get('svix-id') ?? '',
        'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
        'svix-signature': req.headers.get('svix-signature') ?? '',
      };

      try {
        const wh = new Webhook(secret);
        body = wh.verify(payload, svixHeaders) as typeof body;
      } catch (err) {
        console.error('[webhook/resend] Signature verification failed:', err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      console.warn('[webhook/resend] RESEND_WEBHOOK_SECRET not set — signature verification SKIPPED');
      body = JSON.parse(payload);
    }

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

    // ── 3. Buscar en OpsEmailLog (onboarding/comunicaciones) ──
    const opsEmailLog = await prisma.opsEmailLog.findFirst({
      where: { resendId: emailId },
      select: { id: true, guardiaId: true },
    });

    if (opsEmailLog) {
      switch (type) {
        case 'email.delivered':
          await handleOpsEmailDelivered(opsEmailLog.id, data);
          break;
        case 'email.opened':
          await handleOpsEmailOpened(opsEmailLog.id, opsEmailLog.guardiaId, data);
          break;
        case 'email.bounced':
          await handleOpsEmailBounced(opsEmailLog.id, data);
          break;
        default:
          console.log(`ℹ️ Evento no manejado (ops): ${type}`);
      }
    }

    // ── 4. Buscar en FinanceDteEmailLog (Proforma/EP/DTE) ──
    // Soporta tracking de entregas, aperturas, bounces para emails de
    // finanzas. openCount se incrementa en CADA email.opened para que la
    // UI pueda mostrar "vista 3 veces" en cobranza.
    const financeLog = await prisma.financeDteEmailLog.findFirst({
      where: { resendId: emailId },
      select: { id: true },
    });
    if (financeLog) {
      try {
        switch (type) {
          case 'email.delivered':
            await prisma.financeDteEmailLog.update({
              where: { id: financeLog.id },
              data: { deliveredAt: new Date(), status: 'DELIVERED' },
            });
            break;
          case 'email.opened':
            await prisma.financeDteEmailLog.update({
              where: { id: financeLog.id },
              data: {
                openedAt: new Date(), // overwrite con última apertura
                openCount: { increment: 1 },
              },
            });
            break;
          case 'email.bounced':
            await prisma.financeDteEmailLog.update({
              where: { id: financeLog.id },
              data: { bouncedAt: new Date(), status: 'BOUNCED' },
            });
            break;
          case 'email.complained':
            await prisma.financeDteEmailLog.update({
              where: { id: financeLog.id },
              data: { complainedAt: new Date() },
            });
            break;
        }
      } catch (err) {
        console.error('⚠️ Error actualizando FinanceDteEmailLog:', err);
      }
    }

    if (!presentation && !crmMessage && !opsEmailLog && !financeLog) {
      console.warn('⚠️ Ninguna entidad encontrada para emailId:', emailId);
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
        const { notify } = await import("@/lib/notifications/notify");
        await notify({
          tenantId,
          type: 'email_opened',
          audience: 'admin',
          title: `Correo abierto: ${current?.subject || 'Sin asunto'}`,
          body: `${toEmail} abrió tu correo.`,
          data: {
            emailMessageId: messageId,
            dealId: current?.thread?.dealId || null,
          },
          link: current?.thread?.dealId
            ? `/crm/deals/${current.thread.dealId}`
            : undefined,
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

// ─── OPS EMAIL LOG HANDLERS (Onboarding / Comunicaciones) ────────────────

async function handleOpsEmailDelivered(logId: string, data: any) {
  try {
    await prisma.opsEmailLog.update({
      where: { id: logId },
      data: { estado: 'ENTREGADO' },
    });
    console.log('✅ OpsEmailLog entregado:', logId);
  } catch (error) {
    console.error('Error al procesar ops email.delivered:', error);
  }
}

async function handleOpsEmailOpened(logId: string, guardiaId: string, data: any) {
  try {
    await prisma.opsEmailLog.update({
      where: { id: logId },
      data: {
        estado: 'ABIERTO',
        abierto: true,
        fechaAbierto: new Date(data.created_at),
      },
    });

    // Actualizar OnboardingStatus si corresponde
    await prisma.opsOnboardingStatus.updateMany({
      where: { guardiaId },
      data: {
        emailAbierto: true,
        fechaAbierto: new Date(data.created_at),
        estado: 'EN_PROGRESO',
      },
    });

    console.log('👀 OpsEmailLog abierto:', logId);
  } catch (error) {
    console.error('Error al procesar ops email.opened:', error);
  }
}

async function handleOpsEmailBounced(logId: string, data: any) {
  try {
    await prisma.opsEmailLog.update({
      where: { id: logId },
      data: {
        estado: 'REBOTADO',
        rebotado: true,
      },
    });
    console.log('⚠️ OpsEmailLog rebotado:', logId);
  } catch (error) {
    console.error('Error al procesar ops email.bounced:', error);
  }
}
