/**
 * API Route: /api/crm/followup-config
 * GET  - Obtener configuración de follow-ups del tenant
 * POST - Crear/actualizar configuración
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    let config = await prisma.crmFollowUpConfig.findUnique({
      where: { tenantId: ctx.tenantId },
    });

    // Si no existe, devolver defaults
    if (!config) {
      config = {
        id: "",
        tenantId: ctx.tenantId,
        firstFollowUpDays: 3,
        secondFollowUpDays: 7,
        firstEmailTemplateId: null,
        secondEmailTemplateId: null,
        whatsappFirstEnabled: true,
        whatsappSecondEnabled: true,
        autoAdvanceStage: true,
        pauseOnReply: true,
        sendHour: 9,
        isActive: true,
        bccEnabled: false,
        bccEmail: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // Plantillas de correo (módulo mail) para 1er y 2do seguimiento
    const docTemplates = await prisma.docTemplate.findMany({
      where: {
        tenantId: ctx.tenantId,
        module: "mail",
        isActive: true,
      },
      select: { id: true, name: true, category: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: {
        config,
        docTemplates,
      },
    });
  } catch (error) {
    console.error("Error fetching followup config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch config" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json();
    const {
      firstFollowUpDays,
      secondFollowUpDays,
      firstEmailTemplateId,
      secondEmailTemplateId,
      whatsappFirstEnabled,
      whatsappSecondEnabled,
      autoAdvanceStage,
      pauseOnReply,
      sendHour,
      isActive,
      bccEnabled,
      bccEmail,
    } = body;

    const config = await prisma.crmFollowUpConfig.upsert({
      where: { tenantId: ctx.tenantId },
      update: {
        ...(firstFollowUpDays !== undefined ? { firstFollowUpDays } : {}),
        ...(secondFollowUpDays !== undefined ? { secondFollowUpDays } : {}),
        ...(firstEmailTemplateId !== undefined
          ? { firstEmailTemplateId: firstEmailTemplateId || null }
          : {}),
        ...(secondEmailTemplateId !== undefined
          ? { secondEmailTemplateId: secondEmailTemplateId || null }
          : {}),
        ...(whatsappFirstEnabled !== undefined ? { whatsappFirstEnabled } : {}),
        ...(whatsappSecondEnabled !== undefined ? { whatsappSecondEnabled } : {}),
        ...(autoAdvanceStage !== undefined ? { autoAdvanceStage } : {}),
        ...(pauseOnReply !== undefined ? { pauseOnReply } : {}),
        ...(sendHour !== undefined ? { sendHour } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(bccEnabled !== undefined ? { bccEnabled } : {}),
        ...(bccEmail !== undefined ? { bccEmail: bccEmail || null } : {}),
      },
      create: {
        tenantId: ctx.tenantId,
        firstFollowUpDays: firstFollowUpDays ?? 3,
        secondFollowUpDays: secondFollowUpDays ?? 7,
        firstEmailTemplateId: firstEmailTemplateId || null,
        secondEmailTemplateId: secondEmailTemplateId || null,
        whatsappFirstEnabled: whatsappFirstEnabled ?? true,
        whatsappSecondEnabled: whatsappSecondEnabled ?? true,
        autoAdvanceStage: autoAdvanceStage ?? true,
        pauseOnReply: pauseOnReply ?? true,
        sendHour: sendHour ?? 9,
        isActive: isActive ?? true,
        bccEnabled: bccEnabled ?? false,
        bccEmail: bccEmail || null,
      },
    });

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("Error saving followup config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save config" },
      { status: 500 }
    );
  }
}
