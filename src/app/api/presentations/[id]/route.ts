/**
 * API Route: /api/presentations/[id]
 * 
 * GET/PATCH/DELETE filtrados por tenantId de sesión.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDefaultTenantId } from '@/lib/tenant';

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getTenantId() {
  const session = await auth();
  return session?.user?.tenantId ?? getDefaultTenantId();
}

// GET /api/presentations/[id]
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const tenantId = await getTenantId();

    const presentation = await prisma.presentation.findFirst({
      where: { id, tenantId },
      include: {
        template: true,
        views: {
          orderBy: { viewedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!presentation) {
      return NextResponse.json(
        { success: false, error: 'Presentation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: presentation,
    });
  } catch (error) {
    console.error('Error fetching presentation:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch presentation' },
      { status: 500 }
    );
  }
}

// PATCH /api/presentations/[id]
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const tenantId = await getTenantId();
    const body = await request.json();

    const {
      status,
      recipientEmail,
      recipientName,
      notes,
      tags,
      expiresAt,
    } = body;

    const updated = await prisma.presentation.updateMany({
      where: { id, tenantId },
      data: {
        ...(status && { status }),
        ...(recipientEmail !== undefined && { recipientEmail }),
        ...(recipientName !== undefined && { recipientName }),
        ...(notes !== undefined && { notes }),
        ...(tags && { tags }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      },
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Presentation not found' },
        { status: 404 }
      );
    }
    const presentation = await prisma.presentation.findFirst({
      where: { id, tenantId },
      include: { template: true },
    });
    return NextResponse.json({
      success: true,
      data: presentation,
    });
  } catch (error) {
    console.error('Error updating presentation:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update presentation' },
      { status: 500 }
    );
  }
}

// DELETE /api/presentations/[id]
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const tenantId = await getTenantId();

    const deleted = await prisma.presentation.deleteMany({
      where: { id, tenantId },
    });
    if (deleted.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Presentation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Presentation deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting presentation:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete presentation' },
      { status: 500 }
    );
  }
}
