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
 * Documentación: https://resend.com/docs/webhooks
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;

    console.log('📧 Resend webhook recibido:', { type, emailId: data?.email_id });

    // Validar que tenemos el email_id (messageId de Resend)
    const emailId = data?.email_id;
    if (!emailId) {
      console.error('❌ Webhook sin email_id');
      return NextResponse.json(
        { error: 'email_id no proporcionado' },
        { status: 400 }
      );
    }

    // Buscar presentación por emailMessageId
    const presentation = await prisma.presentation.findFirst({
      where: { emailMessageId: emailId },
    });

    if (!presentation) {
      console.warn('⚠️ Presentación no encontrada para emailId:', emailId);
      // No retornar error, puede ser un email de prueba
      return NextResponse.json({ 
        success: true, 
        message: 'Presentación no encontrada (posiblemente email de prueba)' 
      });
    }

    // Procesar según tipo de evento
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
        console.log(`ℹ️ Evento no manejado: ${type}`);
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
