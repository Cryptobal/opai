import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";
import { requireAccessControlAuth } from "@/lib/access-control/auth";
import { DEFAULT_RECORD_TYPE_IDS } from "@/lib/access-control/types";

/**
 * Generates a stable, opaque key for a new custom record type. We avoid
 * slugifying the label so renaming "Llegada" → "Salida" doesn't change
 * the key and orphan existing records. 7 random alnum chars is enough
 * collision space at our scale and stays unique per installation via
 * the @@unique([installationId, key]) constraint.
 */
function generateCustomKey(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 7; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `custom_${suffix}`;
}

/** GET — List all custom record types for an installation (active + soft-deleted). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const { installationId } = await params;
    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const types = await safeAccessControlQuery(
      () => prisma.accessControlRecordType.findMany({
        where: { installationId },
        orderBy: [{ isActive: "desc" }, { orderIdx: "asc" }, { createdAt: "asc" }],
      }),
      [],
    );

    return NextResponse.json({ success: true, data: types ?? [] });
  } catch (error) {
    console.error("[AccessControl] Error listing custom record types:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar tipos personalizados" },
      { status: 500 },
    );
  }
}

/** POST — Create a new custom record type for an installation. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const { installationId } = await params;
    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx || authCtx.authType !== "admin") {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { tenantId: true },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 },
      );
    }

    const body = (await request.json()) as {
      label?: string;
      icon?: string;
      defaultFields?: unknown;
    };

    const label = (body.label ?? "").trim();
    if (!label) {
      return NextResponse.json(
        { success: false, error: "El nombre del tipo es obligatorio" },
        { status: 400 },
      );
    }

    // Find next orderIdx among active types
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
    let created = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      const key = generateCustomKey();
      try {
        created = await prisma.accessControlRecordType.create({
          data: {
            tenantId: installation.tenantId,
            installationId,
            key,
            label,
            icon: (body.icon ?? "UserPlus").toString(),
            defaultFields: (body.defaultFields ?? []) as Prisma.InputJsonValue,
            orderIdx: nextOrder,
            isActive: true,
          },
        });
      } catch (e) {
        // Unique constraint hit → retry with a new key
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
    console.error("[AccessControl] Error creating custom record type:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear tipo personalizado" },
      { status: 500 },
    );
  }
}

/** PATCH — Update label/icon/orderIdx/isActive. Cannot change `key`. Also
 *  refuses to operate on default ids — those live in code. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const { installationId } = await params;
    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx || authCtx.authType !== "admin") {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = (await request.json()) as {
      id?: string;
      label?: string;
      icon?: string;
      orderIdx?: number;
      isActive?: boolean;
      defaultFields?: unknown;
    };

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "id requerido" },
        { status: 400 },
      );
    }

    const existing = await prisma.accessControlRecordType.findFirst({
      where: { id: body.id, installationId },
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
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[AccessControl] Error updating custom record type:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar tipo personalizado" },
      { status: 500 },
    );
  }
}

/** DELETE — Soft-delete a custom record type. Body: { id }. Sets
 *  isActive=false so historical records keep resolving their label
 *  via getRecordTypeLabel (which reads from the DB row). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const { installationId } = await params;
    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx || authCtx.authType !== "admin") {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { id?: string };
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "id requerido" },
        { status: 400 },
      );
    }

    const existing = await prisma.accessControlRecordType.findFirst({
      where: { id: body.id, installationId },
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
    console.error("[AccessControl] Error deleting custom record type:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar tipo personalizado" },
      { status: 500 },
    );
  }
}
