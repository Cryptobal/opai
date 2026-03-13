/**
 * GET  /api/marcacion/oposicion/[token]  — Info de la marcación para el formulario público
 * POST /api/marcacion/oposicion/[token]  — Registrar oposición del trabajador
 *
 * Ruta pública (sin sesión NextAuth). El token actúa como credencial.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Params = { token: string };

function normalizeRut(rut: string): string {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

/** GET — Devuelve datos mínimos para mostrar el formulario (sin RUT ni datos sensibles) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { token } = await params;

  const marcacion = await prisma.opsMarcacion.findFirst({
    where: { oppositionToken: token, deletedAt: null },
    select: {
      id: true,
      tipo: true,
      timestamp: true,
      modificationReason: true,
      modifiedAt: true,
      opposedAt: true,
      consolidatedAt: true,
      isModified: true,
      guardia: {
        select: {
          persona: { select: { firstName: true, lastName: true } },
        },
      },
      installation: { select: { name: true } },
    },
  });

  if (!marcacion || !marcacion.isModified) {
    return NextResponse.json(
      { success: false, error: "Token inválido o expirado" },
      { status: 404 }
    );
  }

  // Verificar si el plazo de 48h ya venció
  const PLAZO_MS = 48 * 60 * 60 * 1000;
  const vencido = marcacion.modifiedAt
    ? Date.now() - marcacion.modifiedAt.getTime() > PLAZO_MS
    : false;

  // Recuperar timestamp original desde AuditLog para mostrar en el formulario
  const auditEntry = await prisma.auditLog.findFirst({
    where: { entity: "ops_marcacion", entityId: marcacion.id, action: "ops.marcacion.modified" },
    orderBy: { createdAt: "desc" },
  });
  const details = auditEntry?.details as Record<string, unknown> | null;
  const changesObj = details?.changes as Record<string, unknown> | undefined;
  const timestampChange = changesObj?.timestamp as Record<string, unknown> | undefined;
  const timestampOriginal = timestampChange?.from ?? null;

  return NextResponse.json({
    success: true,
    data: {
      tipo: marcacion.tipo,
      timestampOriginal: timestampOriginal ?? marcacion.timestamp.toISOString(),
      timestampNuevo: marcacion.timestamp.toISOString(),
      motivo: marcacion.modificationReason,
      modifiedAt: marcacion.modifiedAt?.toISOString() ?? null,
      vencido,
      yaOpuesta: !!marcacion.opposedAt,
      consolidada: !!marcacion.consolidatedAt,
      guardiaName: `${marcacion.guardia.persona.firstName} ${marcacion.guardia.persona.lastName}`,
      installationName: marcacion.installation.name,
    },
  });
}

const postSchema = z.object({
  rut: z.string().min(7, "RUT inválido"),
  motivo: z.string().min(5, "Debe indicar el motivo de su oposición (mín. 5 caracteres)"),
});

/** POST — Registrar oposición */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { token } = await params;

  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return NextResponse.json(
      { success: false, error: errors.rut?.[0] ?? errors.motivo?.[0] ?? "Datos inválidos" },
      { status: 400 }
    );
  }

  const marcacion = await prisma.opsMarcacion.findFirst({
    where: { oppositionToken: token, deletedAt: null },
    include: {
      guardia: {
        select: {
          persona: { select: { rut: true } },
        },
      },
    },
  });

  if (!marcacion || !marcacion.isModified) {
    return NextResponse.json(
      { success: false, error: "Token inválido o expirado" },
      { status: 404 }
    );
  }

  // Verificar identidad del trabajador por RUT
  const guardiaRut = marcacion.guardia.persona.rut ?? "";
  if (normalizeRut(parsed.data.rut) !== normalizeRut(guardiaRut)) {
    return NextResponse.json(
      { success: false, error: "RUT no coincide con el trabajador de esta marcación." },
      { status: 403 }
    );
  }

  if (marcacion.consolidatedAt) {
    return NextResponse.json(
      { success: false, error: "El plazo de oposición ya venció. La modificación fue consolidada." },
      { status: 409 }
    );
  }

  if (marcacion.opposedAt) {
    return NextResponse.json(
      { success: false, error: "Ya registraste tu oposición previamente." },
      { status: 409 }
    );
  }

  // Verificar plazo de 48h
  const PLAZO_MS = 48 * 60 * 60 * 1000;
  if (marcacion.modifiedAt && Date.now() - marcacion.modifiedAt.getTime() > PLAZO_MS) {
    return NextResponse.json(
      { success: false, error: "El plazo de 48 horas para oponerse ya venció." },
      { status: 409 }
    );
  }

  // Recuperar timestamp original desde AuditLog
  let timestampRestored = false;
  const auditEntry = await prisma.auditLog.findFirst({
    where: { entity: "ops_marcacion", entityId: marcacion.id, action: "ops.marcacion.modified" },
    orderBy: { createdAt: "desc" },
  });
  const auditDetails = auditEntry?.details as Record<string, unknown> | null;
  const changesObj = auditDetails?.changes as Record<string, unknown> | undefined;
  const timestampChange = changesObj?.timestamp as Record<string, unknown> | undefined;
  const originalTimestamp = timestampChange?.from ?? null;

  const updateData: Record<string, unknown> = {
    opposedAt: new Date(),
    opposedBy: parsed.data.rut,
    oppositionReason: parsed.data.motivo,
  };

  if (originalTimestamp) {
    updateData.timestamp = new Date(originalTimestamp as string);
    updateData.isModified = false;
    updateData.oppositionToken = null; // Invalidar token
    timestampRestored = true;
  }

  await prisma.opsMarcacion.update({
    where: { id: marcacion.id },
    data: updateData,
  });

  // Crear AuditLog entry
  await prisma.auditLog.create({
    data: {
      tenantId: marcacion.tenantId,
      action: "ops.marcacion.opposed",
      entity: "ops_marcacion",
      entityId: marcacion.id,
      userId: `guardia:${parsed.data.rut}`,
      details: {
        motivo: parsed.data.motivo,
        restored: timestampRestored,
        originalTimestamp,
      },
    },
  });

  // Notificar al admin que hizo la modificación (fire-and-forget)
  if (marcacion.modifiedBy) {
    prisma.admin.findFirst({
      where: { id: marcacion.modifiedBy },
      select: { email: true, name: true },
    }).then(async (admin) => {
      if (admin?.email) {
        const { resend, EMAIL_CONFIG } = await import("@/lib/resend");
        await resend.emails.send({
          from: EMAIL_CONFIG.from,
          to: admin.email,
          subject: `Oposición registrada — marcación modificada`,
          html: `<p>El trabajador con RUT ${parsed.data.rut} se opuso a la modificación de marcación ID <strong>${marcacion.id}</strong>.</p><p>Motivo: ${parsed.data.motivo}</p>`,
        });
      }
    }).catch((err) => console.error("[OPS] Error notificando admin de oposición:", err));
  }

  return NextResponse.json({
    success: true,
    restored: timestampRestored,
    message: timestampRestored
      ? "Tu marcación original fue restaurada."
      : "Tu oposición fue registrada. No había cambio de hora que restaurar.",
  });
}
