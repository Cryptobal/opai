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
        createdBy: true,
        quoteId: true,
      },
    });
    if (!presentation?.quoteId) return;

    const quote = await prisma.cpqQuote.findUnique({
      where: { id: presentation.quoteId },
      select: { dealId: true },
    });
    if (!quote?.dealId) return;

    const deal = await prisma.crmDeal.findUnique({
      where: { id: quote.dealId },
      select: {
        id: true,
        title: true,
        accountId: true,
        account: { select: { portalEjecutivoId: true } },
      },
    });
    if (!deal) return;

    // Determine who to notify: portal executive > presentation creator
    const targetUserId = deal.account.portalEjecutivoId || presentation.createdBy;
    if (!targetUserId) return;

    const clientName = presentation.recipientName || 'Un cliente';
    const dealUrl = `/crm/deals/${deal.id}`;

    // Create internal notification (bell)
    await prisma.notification.create({
      data: {
        tenantId,
        type: 'quote_viewed',
        title: `${clientName} abrió tu propuesta`,
        message: deal.title,
        data: {
          dealId: deal.id,
          accountId: deal.accountId,
          presentationId,
          targetUserId,
        },
        link: dealUrl,
      },
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
