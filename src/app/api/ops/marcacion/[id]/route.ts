/**
 * DELETE /api/ops/marcacion/[id]
 * Soft-delete de una marcación (Resolución N°38 — nunca borrar físicamente).
 * Requiere motivo obligatorio.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, createOpsAuditLog } from "@/lib/ops";
import { sendAvisoModificacionMarcacion } from "@/lib/marcacion-email";
import { z } from "zod";

const deleteSchema = z.object({
  reason: z.string().min(3, "Debe indicar un motivo para eliminar la marcación"),
});

type Params = { id: string };

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Datos inválidos" },
        { status: 400 }
      );
    }

    const marcacion = await prisma.opsMarcacion.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
    });

    if (!marcacion) {
      return NextResponse.json(
        { success: false, error: "Marcación no encontrada" },
        { status: 404 }
      );
    }

    await prisma.opsMarcacion.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId,
        modificationReason: parsed.data.reason,
      },
    });

    await createOpsAuditLog(ctx, "ops.marcacion.soft_deleted", "ops_marcacion", id, {
      reason: parsed.data.reason,
      originalTipo: marcacion.tipo,
      originalTimestamp: marcacion.timestamp,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS] Error soft-deleting marcacion:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ops/marcacion/[id]
 * Modificar una marcación (Resolución N°38 — registrar auditoría).
 */
const patchSchema = z.object({
  reason: z.string().min(3, "Debe indicar un motivo para la modificación"),
  timestamp: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const marcacion = await prisma.opsMarcacion.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
    });

    if (!marcacion) {
      return NextResponse.json(
        { success: false, error: "Marcación no encontrada" },
        { status: 404 }
      );
    }

    // Generar token de oposición único para esta modificación
    const oppositionToken = crypto.randomUUID();
    const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const oppositionUrl = `${baseUrl}/marcacion/oposicion/${oppositionToken}`;

    const updateData: Record<string, unknown> = {
      modifiedAt: new Date(),
      modifiedBy: ctx.userId,
      modificationReason: parsed.data.reason,
      isModified: true,
      // Nueva modificación invalida oposición previa pendiente
      oppositionToken,
      opposedAt: null,
      opposedBy: null,
      oppositionReason: null,
      consolidatedAt: null,
    };

    if (parsed.data.timestamp) {
      updateData.timestamp = new Date(parsed.data.timestamp);
    }

    const updated = await prisma.opsMarcacion.update({
      where: { id },
      data: updateData,
      include: {
        guardia: {
          select: {
            personalEmail: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        installation: { select: { name: true } },
      },
    });

    await createOpsAuditLog(ctx, "ops.marcacion.modified", "ops_marcacion", id, {
      reason: parsed.data.reason,
      changes: parsed.data.timestamp ? { timestamp: { from: marcacion.timestamp, to: parsed.data.timestamp } } : {},
    });

    // Enviar email de aviso al guardia (fire-and-forget)
    const warnings: string[] = [];
    const guardiaEmail = updated.guardia.personalEmail;
    if (guardiaEmail) {
      const guardiaName = `${updated.guardia.persona.firstName} ${updated.guardia.persona.lastName}`;
      const registradoPor = ctx.userEmail ?? ctx.userId;
      sendAvisoModificacionMarcacion({
        guardiaName,
        guardiaEmail,
        guardiaRut: updated.guardia.persona.rut ?? "",
        installationName: updated.installation.name,
        tipo: updated.tipo as "entrada" | "salida",
        timestampOriginal: marcacion.timestamp,
        timestampNuevo: updated.timestamp,
        motivo: parsed.data.reason,
        registradoPor,
        oppositionUrl,
      }).catch((err) => console.error("[OPS] Error enviando email oposición:", err));
    } else {
      warnings.push("guardia_sin_email");
    }

    return NextResponse.json({ success: true, data: updated, warnings });
  } catch (error) {
    console.error("[OPS] Error modifying marcacion:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
