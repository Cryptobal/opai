/**
 * API Route: /api/presentations
 * 
 * GET  - Listar presentaciones del tenant
 * POST - Crear presentación (tenant de sesión)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDefaultTenantId } from '@/lib/tenant';
import { nanoid } from 'nanoid';

// GET /api/presentations
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? await getDefaultTenantId();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: { tenantId: string; status?: string } = { tenantId };
    if (status) where.status = status;

    const [presentations, total] = await Promise.all([
      prisma.presentation.findMany({
        where,
        include: {
          template: true,
          _count: { select: { views: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.presentation.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: presentations,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching presentations:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch presentations' },
      { status: 500 }
    );
  }
}

// POST /api/presentations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      templateId,
      clientData,
      recipientEmail,
      recipientName,
      expiresAt,
      notes,
      tags,
    } = body;

    // Validar campos requeridos
    if (!templateId || !clientData) {
      return NextResponse.json(
        { success: false, error: 'templateId and clientData are required' },
        { status: 400 }
      );
    }

    const session = await auth();
    const tenantId = session?.user?.tenantId ?? await getDefaultTenantId();

    const template = await prisma.template.findFirst({
      where: { id: templateId, tenantId },
    });
    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    const uniqueId = `gard-${nanoid(12)}`;

    // Crear presentación (con tenant)
    const presentation = await prisma.presentation.create({
      data: {
        uniqueId,
        templateId,
        tenantId,
        clientData,
        recipientEmail,
        recipientName,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        notes,
        tags: tags || [],
        status: 'draft',
      },
      include: {
        template: true,
      },
    });

    // Incrementar usage count del template
    await prisma.template.update({
      where: { id: templateId },
      data: { usageCount: { increment: 1 } },
    });

    return NextResponse.json({
      success: true,
      data: presentation,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://opai.gard.cl'}/p/${uniqueId}`,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating presentation:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create presentation' },
      { status: 500 }
    );
  }
}
