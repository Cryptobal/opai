/**
 * @deprecated DESDE: 2026-04-16
 *
 * Este módulo forma parte del Sistema de Presentación Comercial de 29 secciones,
 * que NO se muestra al cliente final. El flujo activo de envío al cliente usa
 * el Portal del Cliente (ver `sendQuoteToPortal()` en
 * `src/modules/cpq/send/send-quote-to-portal.ts`).
 *
 * NO USAR EN CÓDIGO NUEVO. Este archivo será eliminado después de
 * 2026-06-15 una vez confirmada estabilidad.
 *
 * Ver: src/lib/_deprecated/README.md
 */

/**
 * API Route: /api/presentations/[id]/track
 *
 * POST - Registrar una vista de presentación
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Fire-and-forget: notify the assigned executive when a client opens
 * a presentation for the first time.
 */
async function notifyProposalViewed(presentationId: string, tenantId: string) {
  try {
    // Resolve: Presentation → CpqQuote → CrmDeal → CrmAccount
    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
      select: {
        recipientName: true,
        whatsappNumber: true,
        createdBy: true,
        quoteId: true,
      },
    });
    if (!presentation?.quoteId) return;

    const quote = await prisma.cpqQuote.findUnique({
      where: { id: presentation.quoteId },
      select: { dealId: true, contactId: true, name: true },
    });
    if (!quote?.dealId) return;

    const deal = await prisma.crmDeal.findUnique({
      where: { id: quote.dealId },
      select: {
        id: true,
        title: true,
        accountId: true,
        primaryContactId: true,
        account: { select: { portalEjecutivoId: true } },
        primaryContact: { select: { phone: true, firstName: true, lastName: true } },
      },
    });
    if (!deal) return;

    // Determine who to notify: portal executive > presentation creator
    const targetUserId = deal.account.portalEjecutivoId || presentation.createdBy;
    if (!targetUserId) return;

    const clientName = presentation.recipientName || 'Un cliente';
    const dealUrl = `/crm/deals/${deal.id}`;

    // Intentar resolver un teléfono del cliente para el botón de WhatsApp.
    // Prioridad: whatsappNumber de la presentación > contacto del quote > contacto principal del negocio.
    let rawPhone: string | null = presentation.whatsappNumber ?? null;
    if (!rawPhone && quote.contactId) {
      const quoteContact = await prisma.crmContact.findUnique({
        where: { id: quote.contactId },
        select: { phone: true },
      });
      rawPhone = quoteContact?.phone ?? null;
    }
    if (!rawPhone) {
      rawPhone = deal.primaryContact?.phone ?? null;
    }

    // Normalizar a formato wa.me (solo dígitos). Si no tiene código país y parece
    // chileno (8-9 dígitos), asumir +56.
    let waDigits: string | null = null;
    if (rawPhone) {
      const digits = rawPhone.replace(/\D/g, "");
      if (digits.length >= 11) {
        waDigits = digits;
      } else if (digits.length === 9 || digits.length === 8) {
        waDigits = `56${digits}`;
      } else if (digits.length > 0) {
        waDigits = digits;
      }
    }
    // Construir mensaje pre-llenado para WhatsApp
    // Usa solo el primer nombre del cliente y el nombre de la cotización
    const firstName = clientName.split(' ')[0];
    const quoteName = quote.name || deal.title;
    const waText = encodeURIComponent(
      `Hola ${firstName}, vi que abriste nuestra propuesta "${quoteName}", ¿hay algo en que te pueda ayudar?`
    );
    const whatsappUrl = waDigits ? `https://wa.me/${waDigits}?text=${waText}` : undefined;

    // Create internal notification (bell + email) respetando preferencias del usuario.
    // sendNotificationToUser usa UserNotificationPreference para decidir bell/email.
    const { sendNotificationToUser } = await import('@/lib/notification-service');
    await sendNotificationToUser({
      tenantId,
      targetUserId,
      type: 'quote_viewed',
      title: `${clientName} abrió tu propuesta`,
      message: deal.title,
      data: {
        dealId: deal.id,
        accountId: deal.accountId,
        presentationId,
      },
      link: dealUrl,
      emailSecondaryAction: whatsappUrl
        ? {
            url: whatsappUrl,
            label: "Enviar WhatsApp",
            color: "#25D366",
          }
        : null,
    });

    // Send web push notification
    const { sendPushToPortalUser } = await import('@/lib/pwa/push-service');
    await sendPushToPortalUser({
      tenantId,
      notifKey: 'quote_viewed',
      userType: 'admin',
      userId: targetUserId,
      portalType: 'app',
      title: `📄 ${clientName} abrió tu propuesta`,
      body: deal.title,
      url: dealUrl,
      tag: `proposal-viewed-${presentationId}`,
    });
  } catch (err) {
    console.error('[track] Error sending proposal_viewed notification:', err);
  }
}

// POST /api/presentations/[id]/track
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    // Verificar que la presentación existe
    const presentation = await prisma.presentation.findUnique({
      where: { id },
    });

    if (!presentation) {
      return NextResponse.json(
        { success: false, error: 'Presentation not found' },
        { status: 404 }
      );
    }

    const isFirstView = !presentation.firstViewedAt;

    // Obtener datos del viewer
    const ipAddress = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Crear registro de vista
    const view = await prisma.presentationView.create({
      data: {
        presentationId: id,
        ipAddress,
        userAgent,
      },
    });

    // Actualizar contadores de la presentación
    const now = new Date();
    await prisma.presentation.update({
      where: { id },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: now,
        firstViewedAt: presentation.firstViewedAt || now,
        status: presentation.status === 'sent' ? 'viewed' : presentation.status,
      },
    });

    // Fire-and-forget: notify executive on first view only
    if (isFirstView) {
      notifyProposalViewed(id, presentation.tenantId).catch((err) =>
        console.error('[track] notifyProposalViewed failed:', err)
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        viewId: view.id,
        viewCount: presentation.viewCount + 1,
      },
    });
  } catch (error) {
    console.error('Error tracking view:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to track view' },
      { status: 500 }
    );
  }
}
