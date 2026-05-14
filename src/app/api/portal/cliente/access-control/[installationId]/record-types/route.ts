import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ensureInstallationAccess, requirePortalClienteAuth } from "@/lib/portal-cliente";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";
import { DEFAULT_RECORD_TYPE_IDS, SCAN_MODES, type ScanMode } from "@/lib/access-control/types";

/** Mismo helper que el endpoint admin: genera una key opaca para nuevos tipos. */
function generateCustomKey(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 7; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `custom_${suffix}`;
}

function parseScanModes(scanModes: unknown, legacyScanMode?: string): ScanMode[] {
  const allowed = new Set(SCAN_MODES);
  if (Array.isArray(scanModes)) {
    const out: ScanMode[] = [];
    for (const v of scanModes) {
      if (typeof v === "string" && allowed.has(v as ScanMode) && !out.includes(v as ScanMode)) {
        out.push(v as ScanMode);
      }
    }
    if (out.length > 0) return out;
  }
  if (typeof legacyScanMode === "string" && allowed.has(legacyScanMode as ScanMode)) {
    return [legacyScanMode as ScanMode];
  }
  return ["none"];
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

/**
 * Read-only listing of record types available for an installation,
 * scoped to a portal-cliente session. Returns enough info for the
 * cliente components (preregistration, whitelist, history, live) to
 * render correct labels/icons for both built-in and custom types
 * without exposing the admin endpoint.
 *
 * Shape mirrors the relevant subset of `/api/access-control/config`
 * — only what the cliente needs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { installationId } = await params;
    if (!(await ensureInstallationAccess(session, installationId))) {
      return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
    }

    const [config, customRecordTypes] = await Promise.all([
      safeAccessControlQuery(
        () => prisma.accessControlConfig.findUnique({
          where: { installationId },
          select: {
            enabledRecordTypes: true,
            recordTypeLabels: true,
            recordTypeIcons: true,
            recordTypeScanModes: true,
          },
        }),
        null,
      ),
      safeAccessControlQuery(
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
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        enabledRecordTypes: config?.enabledRecordTypes ?? [
          "visit", "provider", "vehicle", "staff", "delivery",
        ],
        recordTypeLabels: config?.recordTypeLabels ?? {},
        recordTypeIcons: config?.recordTypeIcons ?? {},
        recordTypeScanModes: config?.recordTypeScanModes ?? {},
        customRecordTypes: customRecordTypes ?? [],
      },
    });
  } catch (error) {
    console.error("[PortalCliente] Error listing record types:", error);
    return NextResponse.json(
      { success: false, error: "Error al cargar tipos de registro" },
      { status: 500 },
    );
  }
}

/** POST — Crear tipo personalizado para esta instalación. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const { installationId } = await params;
    const { error, session } = await authorize(request, installationId);
    if (error) return error;

    const body = (await request.json()) as {
      label?: string;
      icon?: string;
      defaultFields?: unknown;
      scanMode?: string;
      scanModes?: unknown;
    };

    const label = (body.label ?? "").trim();
    if (!label) {
      return NextResponse.json(
        { success: false, error: "El nombre del tipo es obligatorio" },
        { status: 400 },
      );
    }

    const scanModes = parseScanModes(body.scanModes, body.scanMode);
    const scanMode: ScanMode = scanModes[0] ?? "none";

    const lastOrder = await safeAccessControlQuery(
      () => prisma.accessControlRecordType.aggregate({
        where: { installationId },
        _max: { orderIdx: true },
      }),
      null,
    );
    const nextOrder = (lastOrder?._max.orderIdx ?? -1) + 1;

    let created = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      const key = generateCustomKey();
      try {
        created = await prisma.accessControlRecordType.create({
          data: {
            tenantId: session!.tenantId,
            installationId,
            key,
            label,
            icon: (body.icon ?? "UserPlus").toString(),
            defaultFields: (body.defaultFields ?? []) as Prisma.InputJsonValue,
            scanMode,
            scanModes,
            orderIdx: nextOrder,
            isActive: true,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
    }

    if (!created) {
      return NextResponse.json(
        { success: false, error: "No se pudo generar un identificador único" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    console.error("[PortalCliente/AccessControl] Error creating record type:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear tipo personalizado" },
      { status: 500 },
    );
  }
}

/** PATCH — Actualizar label/icon/orderIdx/isActive/scanModes de un tipo
 *  personalizado. No permite tocar tipos default. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const { installationId } = await params;
    const { error, session } = await authorize(request, installationId);
    if (error) return error;

    const body = (await request.json()) as {
      id?: string;
      label?: string;
      icon?: string;
      orderIdx?: number;
      isActive?: boolean;
      defaultFields?: unknown;
      scanMode?: string;
      scanModes?: unknown;
    };

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "id requerido" },
        { status: 400 },
      );
    }

    const existing = await prisma.accessControlRecordType.findFirst({
      where: { id: body.id, installationId, tenantId: session!.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Tipo no encontrado" },
        { status: 404 },
      );
    }

    if ((DEFAULT_RECORD_TYPE_IDS as readonly string[]).includes(existing.key)) {
      return NextResponse.json(
        { success: false, error: "No se puede modificar un tipo por defecto desde este endpoint" },
        { status: 400 },
      );
    }

    const scanModesUpdate =
      body.scanModes !== undefined || body.scanMode !== undefined
        ? (() => {
            const modes = parseScanModes(body.scanModes, body.scanMode);
            return { scanModes: modes, scanMode: modes[0] ?? "none" };
          })()
        : {};

    const updated = await prisma.accessControlRecordType.update({
      where: { id: body.id },
      data: {
        ...(body.label !== undefined ? { label: String(body.label).trim() } : {}),
        ...(body.icon !== undefined ? { icon: String(body.icon) } : {}),
        ...(body.orderIdx !== undefined ? { orderIdx: Number(body.orderIdx) } : {}),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
        ...(body.defaultFields !== undefined
          ? { defaultFields: body.defaultFields as Prisma.InputJsonValue }
          : {}),
        ...scanModesUpdate,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PortalCliente/AccessControl] Error updating record type:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar tipo personalizado" },
      { status: 500 },
    );
  }
}

/** DELETE — Soft-delete: setea isActive=false. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const { installationId } = await params;
    const { error, session } = await authorize(request, installationId);
    if (error) return error;

    const body = (await request.json().catch(() => ({}))) as { id?: string };
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "id requerido" },
        { status: 400 },
      );
    }

    const existing = await prisma.accessControlRecordType.findFirst({
      where: { id: body.id, installationId, tenantId: session!.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Tipo no encontrado" },
        { status: 404 },
      );
    }

    await prisma.accessControlRecordType.update({
      where: { id: body.id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PortalCliente/AccessControl] Error deleting record type:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar tipo personalizado" },
      { status: 500 },
    );
  }
}
