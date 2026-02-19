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
        thirdFollowUpDays: 3,
        firstEmailTemplateId: null,
        secondEmailTemplateId: null,
        thirdEmailTemplateId: null,
        whatsappFirstEnabled: true,
        whatsappSecondEnabled: true,
        whatsappThirdEnabled: true,
        autoAdvanceStage: true,
        firstFollowUpStageId: null,
        secondFollowUpStageId: null,
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

    const stages = await prisma.crmPipelineStage.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        isClosedWon: true,
        isClosedLost: true,
      },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: {
        config,
        docTemplates,
        stages,
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
      thirdFollowUpDays,
      firstEmailTemplateId,
      secondEmailTemplateId,
      thirdEmailTemplateId,
      whatsappFirstEnabled,
      whatsappSecondEnabled,
      whatsappThirdEnabled,
      autoAdvanceStage,
      firstFollowUpStageId,
      secondFollowUpStageId,
      pauseOnReply,
      sendHour,
      isActive,
      bccEnabled,
      bccEmail,
    } = body;

    if (
      thirdFollowUpDays !== undefined &&
      (!Number.isInteger(thirdFollowUpDays) || thirdFollowUpDays < 1 || thirdFollowUpDays > 90)
    ) {
      return NextResponse.json(
        { success: false, error: "thirdFollowUpDays debe ser un número entre 1 y 90" },
        { status: 400 }
      );
    }

    const config = await prisma.crmFollowUpConfig.upsert({
      where: { tenantId: ctx.tenantId },
      update: {
        ...(firstFollowUpDays !== undefined ? { firstFollowUpDays } : {}),
        ...(secondFollowUpDays !== undefined ? { secondFollowUpDays } : {}),
        ...(thirdFollowUpDays !== undefined ? { thirdFollowUpDays } : {}),
        ...(firstEmailTemplateId !== undefined
          ? { firstEmailTemplateId: firstEmailTemplateId || null }
          : {}),
        ...(secondEmailTemplateId !== undefined
          ? { secondEmailTemplateId: secondEmailTemplateId || null }
          : {}),
        ...(thirdEmailTemplateId !== undefined
          ? { thirdEmailTemplateId: thirdEmailTemplateId || null }
          : {}),
        ...(whatsappFirstEnabled !== undefined ? { whatsappFirstEnabled } : {}),
        ...(whatsappSecondEnabled !== undefined ? { whatsappSecondEnabled } : {}),
        ...(whatsappThirdEnabled !== undefined ? { whatsappThirdEnabled } : {}),
        ...(autoAdvanceStage !== undefined ? { autoAdvanceStage } : {}),
        ...(firstFollowUpStageId !== undefined
          ? { firstFollowUpStageId: firstFollowUpStageId || null }
          : {}),
        ...(secondFollowUpStageId !== undefined
          ? { secondFollowUpStageId: secondFollowUpStageId || null }
          : {}),
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
        thirdFollowUpDays: thirdFollowUpDays ?? 3,
        firstEmailTemplateId: firstEmailTemplateId || null,
        secondEmailTemplateId: secondEmailTemplateId || null,
        thirdEmailTemplateId: thirdEmailTemplateId || null,
        whatsappFirstEnabled: whatsappFirstEnabled ?? true,
        whatsappSecondEnabled: whatsappSecondEnabled ?? true,
        whatsappThirdEnabled: whatsappThirdEnabled ?? true,
        autoAdvanceStage: autoAdvanceStage ?? true,
        firstFollowUpStageId: firstFollowUpStageId || null,
        secondFollowUpStageId: secondFollowUpStageId || null,
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
