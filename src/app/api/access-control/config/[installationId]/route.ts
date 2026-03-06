import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    const config = await prisma.accessControlConfig.findUnique({
      where: { installationId },
    });

    if (!config) {
      // Return default config
      return NextResponse.json({
        success: true,
        data: {
          installationId,
          enabledRecordTypes: [],
          useWhitelist: false,
          useBlacklist: false,
          requireIdValidation: false,
          requirePhoto: false,
          requireSignature: false,
          maxStayHours: null,
          autoReportSchedule: null,
          formConfig: {},
        },
      });
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[AccessControl] Error fetching config:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuración" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const body = await request.json();

    // Get installation to extract tenantId
    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { tenantId: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const config = await prisma.accessControlConfig.upsert({
      where: { installationId },
      update: {
        enabledRecordTypes: body.enabledRecordTypes ?? [],
        useWhitelist: body.useWhitelist ?? false,
        useBlacklist: body.useBlacklist ?? false,
        requireIdValidation: body.requireIdValidation ?? false,
        requirePhoto: body.requirePhoto ?? false,
        requireSignature: body.requireSignature ?? false,
        maxStayHours: body.maxStayHours ?? null,
        autoReportSchedule: body.autoReportSchedule ?? null,
        formConfig: body.formConfig ?? {},
      },
      create: {
        tenantId: installation.tenantId,
        installationId,
        enabledRecordTypes: body.enabledRecordTypes ?? [],
        useWhitelist: body.useWhitelist ?? false,
        useBlacklist: body.useBlacklist ?? false,
        requireIdValidation: body.requireIdValidation ?? false,
        requirePhoto: body.requirePhoto ?? false,
        requireSignature: body.requireSignature ?? false,
        maxStayHours: body.maxStayHours ?? null,
        autoReportSchedule: body.autoReportSchedule ?? null,
        formConfig: body.formConfig ?? {},
      },
    });

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[AccessControl] Error updating config:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar configuración" },
      { status: 500 }
    );
  }
}
