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
  whitelistRecordTypes: [] as string[],
  blacklistRecordTypes: [] as string[],
  requireIdValidation: false,
  requirePhoto: false,
  requireSignature: false,
  maxStayHours: null,
  autoReportSchedule: null,
  formConfig: {},
  recordTypeLabels: {},
  recordTypeIcons: {},
  recordTypeScanModes: {},
  customRecordTypes: [] as Array<{
    id: string;
    key: string;
    label: string;
    icon: string;
    defaultFields: unknown[];
    scanMode: string;
    scanModes: string[];
    orderIdx: number;
    isActive: boolean;
  }>,
});

/** Sanitiza el JSON de overrides por tipo: solo deja entries con array
 *  de ScanMode válidos. Devuelve el objeto con la forma exacta esperada
 *  por la columna recordTypeScanModes. */
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

    // Always include active custom record types for this installation.
    // Inactive (soft-deleted) types are omitted so the admin UI and the
    // mobile portal both stop offering them — but the rows stay in the
    // DB so historic AccessControlRecords keep resolving their label.
    const customRecordTypes = await safeAccessControlQuery(
      () => prisma.accessControlRecordType.findMany({
        where: { installationId, isActive: true },
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

    // El tenant context lo resuelve requireAccessControlAuth contra esta
    // instalación: si la instalación no pertenece al tenant de la sesión,
    // devuelve null y respondemos 401 antes de tocar la BD. Por eso el
    // upsert puede usar `where: { installationId }` (campo @unique) sin
    // un AND extra de tenantId — la autorización ya filtró cross-tenant.
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

    // PUT no destructivo: igual que PATCH, solo escribe los campos
    // presentes en el body. Antes este handler caía a [] / false / {}
    // para todo campo ausente — un body parcial del portal o del ERP
    // podía borrar enabledRecordTypes, formConfig, recordTypeLabels,
    // etc. Ahora un PUT con {useWhitelist:true} ya no toca el resto.
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
    if ("whitelistRecordTypes" in body) {
      const arr = Array.isArray(body.whitelistRecordTypes)
        ? (body.whitelistRecordTypes as unknown[]).filter((t): t is string => typeof t === "string")
        : [];
      updateData.whitelistRecordTypes = arr;
      updateData.useWhitelist = arr.length > 0;
    }
    if ("blacklistRecordTypes" in body) {
      const arr = Array.isArray(body.blacklistRecordTypes)
        ? (body.blacklistRecordTypes as unknown[]).filter((t): t is string => typeof t === "string")
        : [];
      updateData.blacklistRecordTypes = arr;
      updateData.useBlacklist = arr.length > 0;
    }

    const config = await safeAccessControlQuery(
      () => prisma.accessControlConfig.upsert({
        where: { installationId },
        update: updateData,
        // Para CREATE (primera vez que se configura la instalación) sí usamos
        // defaults — equivalen a "config recién iniciada con todos los tipos
        // habilitados". Solo aplica si la fila no existe.
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
          recordTypeLabels: (body.recordTypeLabels ?? {}) as Prisma.InputJsonValue,
          recordTypeIcons: (body.recordTypeIcons ?? {}) as Prisma.InputJsonValue,
          recordTypeScanModes: normalizeRecordTypeScanModes(body.recordTypeScanModes) as Prisma.InputJsonValue,
          whitelistRecordTypes: Array.isArray(body.whitelistRecordTypes)
            ? (body.whitelistRecordTypes as unknown[]).filter((t): t is string => typeof t === "string")
            : [],
          blacklistRecordTypes: Array.isArray(body.blacklistRecordTypes)
            ? (body.blacklistRecordTypes as unknown[]).filter((t): t is string => typeof t === "string")
            : [],
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
    if ("recordTypeLabels" in body) updateData.recordTypeLabels = (body.recordTypeLabels ?? {}) as Prisma.InputJsonValue;
    if ("recordTypeIcons" in body) updateData.recordTypeIcons = (body.recordTypeIcons ?? {}) as Prisma.InputJsonValue;
    if ("recordTypeScanModes" in body) {
      updateData.recordTypeScanModes = normalizeRecordTypeScanModes(body.recordTypeScanModes) as Prisma.InputJsonValue;
    }
    if ("whitelistRecordTypes" in body) {
      const arr = Array.isArray(body.whitelistRecordTypes)
        ? (body.whitelistRecordTypes as unknown[]).filter((t): t is string => typeof t === "string")
        : [];
      updateData.whitelistRecordTypes = arr;
      updateData.useWhitelist = arr.length > 0;
    }
    if ("blacklistRecordTypes" in body) {
      const arr = Array.isArray(body.blacklistRecordTypes)
        ? (body.blacklistRecordTypes as unknown[]).filter((t): t is string => typeof t === "string")
        : [];
      updateData.blacklistRecordTypes = arr;
      updateData.useBlacklist = arr.length > 0;
    }

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
          recordTypeLabels: (body.recordTypeLabels ?? {}) as Prisma.InputJsonValue,
          recordTypeIcons: (body.recordTypeIcons ?? {}) as Prisma.InputJsonValue,
          recordTypeScanModes: normalizeRecordTypeScanModes(body.recordTypeScanModes) as Prisma.InputJsonValue,
          whitelistRecordTypes: Array.isArray(body.whitelistRecordTypes)
            ? (body.whitelistRecordTypes as unknown[]).filter((t): t is string => typeof t === "string")
            : [],
          blacklistRecordTypes: Array.isArray(body.blacklistRecordTypes)
            ? (body.blacklistRecordTypes as unknown[]).filter((t): t is string => typeof t === "string")
            : [],
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
