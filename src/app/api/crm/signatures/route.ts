/**
 * API Route: /api/crm/signatures
 * GET  - Listar firmas del tenant (opcionalmente filtrar por userId)
 * POST - Crear nueva firma
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const onlyMine = searchParams.get("mine") === "true";

    const signatures = await prisma.crmEmailSignature.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        ...(onlyMine ? { userId: ctx.userId } : {}),
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: signatures });
  } catch (error) {
    console.error("Error fetching signatures:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch signatures" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const { name, content, htmlContent, isDefault } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: "El nombre es obligatorio" },
        { status: 400 }
      );
    }

    // Si se marca como default, desmarcar las demás del usuario
    if (isDefault) {
      await prisma.crmEmailSignature.updateMany({
        where: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const signature = await prisma.crmEmailSignature.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        name: name.trim(),
        content: content || {},
        htmlContent: htmlContent || null,
        isDefault: isDefault ?? false,
      },
    });

    return NextResponse.json({ success: true, data: signature }, { status: 201 });
  } catch (error) {
    console.error("Error creating signature:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create signature" },
      { status: 500 }
    );
  }
}
