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
