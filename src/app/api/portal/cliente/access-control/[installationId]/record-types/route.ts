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

    // Retry-on-collision: even though `custom_<random>` is unique with
    // high probability, the @@unique([installationId, key]) constraint
    // guarantees correctness. 3 retries is plenty.
    //
    // Atomic: dentro de la misma transacción, añadimos la key a
    // `enabledRecordTypes` del config (creando el config si no existe).
    // Evita el estado inconsistente donde el tipo existe pero el portal
    // de terreno no lo ve hasta que el admin presiona "Guardar".
    let created: Awaited<ReturnType<typeof prisma.accessControlRecordType.create>> | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      const key = generateCustomKey();
      try {
        created = await prisma.$transaction(async (tx) => {
          const row = await tx.accessControlRecordType.create({
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

          const existingCfg = await tx.accessControlConfig.findUnique({
            where: { installationId },
            select: { enabledRecordTypes: true },
          });
          const nextEnabled = existingCfg
            ? Array.from(new Set([...(existingCfg.enabledRecordTypes ?? []), key]))
            : ["visit", "provider", "vehicle", "staff", "delivery", key];

          await tx.accessControlConfig.upsert({
            where: { installationId },
            update: { enabledRecordTypes: nextEnabled },
            create: {
              tenantId: session!.tenantId,
              installationId,
              enabledRecordTypes: nextEnabled,
            },
          });

          return row;
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

    // Atomic: soft-delete + limpiar la key de TODOS los lugares donde
    // pudiera quedar referenciada en el config. Si no lo hacemos, el
    // portal de terreno (que itera sobre enabledRecordTypes) sigue
    // mostrando un botón con la key sin label/icon hasta que el admin
    // presione "Guardar".
    const stripKeyFromJson = (json: unknown, key: string): Prisma.InputJsonValue => {
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        return (json ?? {}) as Prisma.InputJsonValue;
      }
      const copy = { ...(json as Record<string, unknown>) };
      delete copy[key];
      return copy as Prisma.InputJsonValue;
    };

    await prisma.$transaction(async (tx) => {
      await tx.accessControlRecordType.update({
        where: { id: body.id },
        data: { isActive: false },
      });

      const cfg = await tx.accessControlConfig.findUnique({
        where: { installationId },
        select: {
          enabledRecordTypes: true,
          formConfig: true,
          recordTypeLabels: true,
          recordTypeIcons: true,
          recordTypeScanModes: true,
        },
      });

      if (cfg) {
        await tx.accessControlConfig.update({
          where: { installationId },
          data: {
            enabledRecordTypes: (cfg.enabledRecordTypes ?? []).filter((k) => k !== existing.key),
            formConfig: stripKeyFromJson(cfg.formConfig, existing.key),
            recordTypeLabels: stripKeyFromJson(cfg.recordTypeLabels, existing.key),
            recordTypeIcons: stripKeyFromJson(cfg.recordTypeIcons, existing.key),
            recordTypeScanModes: stripKeyFromJson(cfg.recordTypeScanModes, existing.key),
          },
        });
      }
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
