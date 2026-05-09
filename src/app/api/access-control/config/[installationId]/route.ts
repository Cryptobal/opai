import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";
import { requireAccessControlAuth } from "@/lib/access-control/auth";

const defaultConfig = (installationId: string) => ({
  installationId,
  enabledRecordTypes: ["visit", "provider", "vehicle", "staff", "delivery"],
  useWhitelist: false,
  useBlacklist: false,
  requireIdValidation: false,
  requirePhoto: false,
  requireSignature: false,
  maxStayHours: null,
  autoReportSchedule: null,
  formConfig: {},
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const config = await safeAccessControlQuery(
      () => prisma.accessControlConfig.findUnique({ where: { installationId } }),
      null,
    );

    if (!config) {
      return NextResponse.json({
        success: true,
        data: defaultConfig(installationId),
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

    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();

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

    const config = await safeAccessControlQuery(
      () => prisma.accessControlConfig.upsert({
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
          formConfig: (body.formConfig ?? {}) as Prisma.InputJsonValue,
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
          formConfig: (body.formConfig ?? {}) as Prisma.InputJsonValue,
        },
      }),
      null,
    );

    if (!config) {
      return NextResponse.json(
        { success: false, error: "Las tablas de control de acceso aún no existen. Ejecute la migración de base de datos." },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[AccessControl] Error updating config:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar configuración" },
      { status: 500 }
    );
  }
}

/**
 * Actualización parcial — sólo persiste los campos presentes en el body.
 * Usada para auto-guardar campos individuales (ej. autoReportSchedule)
 * sin requerir un round-trip completo del formulario.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;

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

    const updateData: Prisma.AccessControlConfigUpdateInput = {};
    if ("enabledRecordTypes" in body) updateData.enabledRecordTypes = (body.enabledRecordTypes as string[]) ?? [];
    if ("useWhitelist" in body) updateData.useWhitelist = Boolean(body.useWhitelist);
    if ("useBlacklist" in body) updateData.useBlacklist = Boolean(body.useBlacklist);
    if ("requireIdValidation" in body) updateData.requireIdValidation = Boolean(body.requireIdValidation);
    if ("requirePhoto" in body) updateData.requirePhoto = Boolean(body.requirePhoto);
    if ("requireSignature" in body) updateData.requireSignature = Boolean(body.requireSignature);
    if ("maxStayHours" in body) updateData.maxStayHours = (body.maxStayHours as number | null) ?? null;
    if ("autoReportSchedule" in body) updateData.autoReportSchedule = (body.autoReportSchedule as string | null) ?? null;
    if ("formConfig" in body) updateData.formConfig = (body.formConfig ?? {}) as Prisma.InputJsonValue;

    const config = await safeAccessControlQuery(
      () => prisma.accessControlConfig.upsert({
        where: { installationId },
        update: updateData,
        create: {
          tenantId: installation.tenantId,
          installationId,
          enabledRecordTypes: (body.enabledRecordTypes as string[]) ?? ["visit", "provider", "vehicle", "staff", "delivery"],
          useWhitelist: Boolean(body.useWhitelist ?? false),
          useBlacklist: Boolean(body.useBlacklist ?? false),
          requireIdValidation: Boolean(body.requireIdValidation ?? false),
          requirePhoto: Boolean(body.requirePhoto ?? false),
          requireSignature: Boolean(body.requireSignature ?? false),
          maxStayHours: (body.maxStayHours as number | null) ?? null,
          autoReportSchedule: (body.autoReportSchedule as string | null) ?? null,
          formConfig: (body.formConfig ?? {}) as Prisma.InputJsonValue,
        },
      }),
      null,
    );

    if (!config) {
      return NextResponse.json(
        { success: false, error: "Las tablas de control de acceso aún no existen. Ejecute la migración de base de datos." },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[AccessControl] Error patching config:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar configuración" },
      { status: 500 }
    );
  }
}
