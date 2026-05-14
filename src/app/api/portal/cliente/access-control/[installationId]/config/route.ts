import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";
import { ensureInstallationAccess, requirePortalClienteAuth } from "@/lib/portal-cliente";

/**
 * Espejo del endpoint admin /api/access-control/config/[installationId] para
 * que el cliente pueda ver/editar la configuración completa de Control de
 * Acceso de su instalación. Cualquier cambio acá se refleja en el ERP y
 * viceversa — es la misma fila de AccessControlConfig.
 */

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
  recordTypeLabels: {},
  recordTypeIcons: {},
  recordTypeScanModes: {},
});

function normalizeRecordTypeScanModes(input: unknown): Record<string, string[]> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const allowed = new Set(["plate", "rut", "none"]);
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const cleaned: string[] = [];
    for (const v of value) {
      if (typeof v === "string" && allowed.has(v) && !cleaned.includes(v)) cleaned.push(v);
    }
    if (cleaned.length > 0) out[key] = cleaned;
  }
  return out;
}

async function authorize(request: NextRequest, installationId: string) {
  const session = await requirePortalClienteAuth(request);
  if (!session) {
    return { error: NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 }), session: null };
  }
  if (!(await ensureInstallationAccess(session, installationId))) {
    return { error: NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 }), session: null };
  }
  return { error: null, session };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const { error, session } = await authorize(request, installationId);
    if (error) return error;

    const config = await safeAccessControlQuery(
      () => prisma.accessControlConfig.findFirst({
        where: { installationId, tenantId: session!.tenantId },
      }),
      null,
    );

    const customRecordTypes = await safeAccessControlQuery(
      () => prisma.accessControlRecordType.findMany({
        where: { installationId, tenantId: session!.tenantId, isActive: true },
        orderBy: { orderIdx: "asc" },
        select: {
          id: true, key: true, label: true, icon: true,
          defaultFields: true, scanMode: true, scanModes: true,
          orderIdx: true, isActive: true,
        },
      }),
      [],
    );

    if (!config) {
      return NextResponse.json({
        success: true,
        data: { ...defaultConfig(installationId), customRecordTypes: customRecordTypes ?? [] },
      });
    }

    return NextResponse.json({
      success: true,
      data: { ...config, customRecordTypes: customRecordTypes ?? [] },
    });
  } catch (error) {
    console.error("[PortalCliente/AccessControl] Error fetching config:", error);
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
    // ensureInstallationAccess + requirePortalClienteAuth ya validaron que
    // la instalación pertenece al tenant de la sesión. El upsert puede
    // usar `where: { installationId }` (campo @unique) sin un AND extra.
    const { error, session } = await authorize(request, installationId);
    if (error) return error;

    const body = (await request.json()) as Record<string, unknown>;

    // PUT no destructivo: igual que PATCH, solo escribe los campos
    // presentes en el body. El portal cliente suele mandar bodies
    // parciales (un solo toggle a la vez) — antes esos bodies pisaban
    // enabledRecordTypes, formConfig, recordTypeLabels con [] / {}, lo
    // que terminó borrando la config completa de instalaciones reales.
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
    if ("recordTypeLabels" in body) updateData.recordTypeLabels = (body.recordTypeLabels ?? {}) as Prisma.InputJsonValue;
    if ("recordTypeIcons" in body) updateData.recordTypeIcons = (body.recordTypeIcons ?? {}) as Prisma.InputJsonValue;
    if ("recordTypeScanModes" in body) {
      updateData.recordTypeScanModes = normalizeRecordTypeScanModes(body.recordTypeScanModes) as Prisma.InputJsonValue;
    }

    const config = await safeAccessControlQuery(
      () => prisma.accessControlConfig.upsert({
        where: { installationId },
        update: updateData,
        // Para CREATE (primera vez): defaults razonables. Solo se aplica
        // si la fila no existe; un body parcial NO afecta este path.
        create: {
          tenantId: session!.tenantId,
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
          recordTypeLabels: (body.recordTypeLabels ?? {}) as Prisma.InputJsonValue,
          recordTypeIcons: (body.recordTypeIcons ?? {}) as Prisma.InputJsonValue,
          recordTypeScanModes: normalizeRecordTypeScanModes(body.recordTypeScanModes) as Prisma.InputJsonValue,
        },
      }),
      null,
    );

    if (!config) {
      return NextResponse.json(
        { success: false, error: "Las tablas de control de acceso aún no existen." },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[PortalCliente/AccessControl] Error updating config:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar configuración" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const { error, session } = await authorize(request, installationId);
    if (error) return error;

    const body = (await request.json()) as Record<string, unknown>;

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
    if ("recordTypeLabels" in body) updateData.recordTypeLabels = (body.recordTypeLabels ?? {}) as Prisma.InputJsonValue;
    if ("recordTypeIcons" in body) updateData.recordTypeIcons = (body.recordTypeIcons ?? {}) as Prisma.InputJsonValue;
    if ("recordTypeScanModes" in body) {
      updateData.recordTypeScanModes = normalizeRecordTypeScanModes(body.recordTypeScanModes) as Prisma.InputJsonValue;
    }

    const config = await safeAccessControlQuery(
      () => prisma.accessControlConfig.upsert({
        where: { installationId },
        update: updateData,
        create: {
          tenantId: session!.tenantId,
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
          recordTypeLabels: (body.recordTypeLabels ?? {}) as Prisma.InputJsonValue,
          recordTypeIcons: (body.recordTypeIcons ?? {}) as Prisma.InputJsonValue,
          recordTypeScanModes: normalizeRecordTypeScanModes(body.recordTypeScanModes) as Prisma.InputJsonValue,
        },
      }),
      null,
    );

    if (!config) {
      return NextResponse.json(
        { success: false, error: "Las tablas de control de acceso aún no existen." },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[PortalCliente/AccessControl] Error patching config:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar configuración" },
      { status: 500 }
    );
  }
}
