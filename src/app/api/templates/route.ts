/**
 * API Route: /api/templates
 * 
 * GET  - Listar templates del tenant
 * POST - Crear template (tenant de sesión)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDefaultTenantId } from '@/lib/tenant';

// GET /api/templates
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? await getDefaultTenantId();

    const { searchParams } = new URL(request.url);
    const active = searchParams.get('active');
    const type = searchParams.get('type');

    const where: { tenantId: string; active?: boolean; type?: string } = { tenantId };
    if (active !== null && active !== undefined) {
      where.active = active === 'true';
    }
    if (type) where.type = type;

    const templates = await prisma.template.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { usageCount: 'desc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// POST /api/templates
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      name,
      slug,
      description,
      type,
      category,
      active,
      isDefault,
      thumbnailUrl,
    } = body;

    // Validar campos requeridos
    if (!name || !slug || !type) {
      return NextResponse.json(
        { success: false, error: 'name, slug, and type are required' },
        { status: 400 }
      );
    }

    const session = await auth();
    const tenantId = session?.user?.tenantId ?? await getDefaultTenantId();
    const template = await prisma.template.create({
      data: {
        name,
        slug,
        description,
        type,
        category,
        active: active ?? true,
        isDefault: isDefault ?? false,
        thumbnailUrl,
        tenantId,
      },
    });

    return NextResponse.json({
      success: true,
      data: template,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create template' },
      { status: 500 }
    );
  }
}
