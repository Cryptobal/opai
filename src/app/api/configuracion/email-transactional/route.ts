import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  TRANSACTIONAL_EMAIL_CATALOG,
  getTransactionalKind,
} from "@/lib/email/transactional-catalog";

/**
 * GET /api/configuracion/email-transactional
 *
 * Devuelve el catálogo completo de correos transaccionales junto al estado
 * actual (enabled) de cada kind para el tenant que llama. Si un kind no
 * tiene fila en `TenantTransactionalEmailConfig`, se asume `enabled: true`.
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const overrides = await prisma.tenantTransactionalEmailConfig.findMany({
      where: { tenantId: ctx.tenantId },
      select: { kind: true, enabled: true, updatedAt: true },
    });
    const overrideMap = new Map(overrides.map((o) => [o.kind, o]));

    const data = TRANSACTIONAL_EMAIL_CATALOG.map((k) => {
      const override = overrideMap.get(k.key);
      return {
        ...k,
        enabled: override?.enabled ?? true,
        updatedAt: override?.updatedAt ?? null,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[CONFIG] Error loading transactional email config:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cargar la configuración" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/configuracion/email-transactional
 * Body: { kind: string, enabled: boolean }
 *
 * Solo owner / admin pueden cambiar toggles. Kinds marcados `required: true`
 * en el catálogo no pueden desactivarse.
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    if (!["owner", "admin"].includes(ctx.userRole ?? "")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden modificar esta configuración" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const kind = typeof body?.kind === "string" ? body.kind : null;
    const enabled = typeof body?.enabled === "boolean" ? body.enabled : null;
    if (!kind || enabled === null) {
      return NextResponse.json(
        { success: false, error: "Se requieren `kind` (string) y `enabled` (boolean)" },
        { status: 400 },
      );
    }

    const kindDef = getTransactionalKind(kind);
    if (!kindDef) {
      return NextResponse.json(
        { success: false, error: `kind \"${kind}\" no existe en el catálogo` },
        { status: 400 },
      );
    }

    if (kindDef.required && enabled === false) {
      return NextResponse.json(
        {
          success: false,
          error: `El correo \"${kindDef.label}\" es crítico de sistema y no puede desactivarse.`,
        },
        { status: 400 },
      );
    }

    await prisma.tenantTransactionalEmailConfig.upsert({
      where: { tenantId_kind: { tenantId: ctx.tenantId, kind } },
      create: {
        tenantId: ctx.tenantId,
        kind,
        enabled,
        updatedBy: ctx.userId,
      },
      update: {
        enabled,
        updatedBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CONFIG] Error updating transactional email config:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la configuración" },
      { status: 500 },
    );
  }
}
