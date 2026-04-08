import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

const patchSchema = z.object({
  // Se permite string vacío o null para limpiar el contacto.
  dpoContactEmail: z.union([z.string().email(), z.literal(""), z.null()]),
});

/**
 * GET /api/tenant/dpo-contact
 * Devuelve el contacto del DPO del tenant.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { dpoContactEmail: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        dpoContactEmail: tenant?.dpoContactEmail ?? null,
      },
    });
  } catch (error) {
    console.error("[tenant/dpo-contact GET] Error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

/**
 * PATCH /api/tenant/dpo-contact
 * Configura el email de contacto del DPO del tenant (Ley 21.719).
 * Solo owner/admin.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    if (!["owner", "admin"].includes(auth.userRole)) {
      return NextResponse.json(
        { success: false, error: "Solo el owner o admin puede configurar el contacto del DPO" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Email inválido", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const value = parsed.data.dpoContactEmail;
    const nextEmail = value && value.length > 0 ? value : null;

    const tenant = await prisma.tenant.update({
      where: { id: auth.tenantId },
      data: { dpoContactEmail: nextEmail },
      select: { id: true, dpoContactEmail: true },
    });

    await logAudit({
      userId: auth.userId,
      userEmail: auth.userEmail,
      action: "UPDATE",
      entity: "Tenant",
      entityId: tenant.id,
      details: { type: "DPO_CONTACT_UPDATED", dpoContactEmail: nextEmail },
      tenantId: auth.tenantId,
      request,
    });

    return NextResponse.json({ success: true, data: tenant });
  } catch (error) {
    console.error("[tenant/dpo-contact PATCH] Error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
