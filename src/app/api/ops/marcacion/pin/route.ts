/**
 * POST /api/ops/marcacion/pin
 * Asignar o resetear el PIN de marcación de un guardia.
 * Ruta protegida (requiere auth + acceso OPS).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { canReloadGuardiaMarcacionPin } from "@/lib/ops-rbac";
import { generatePin } from "@/lib/marcacion";
import * as bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  guardiaId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { allowed } = checkRateLimit(`ops-marcacion-pin:${ip}`, { limit: 10, windowSeconds: 60 });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Demasiados intentos. Intente nuevamente en un momento." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    const auth = await requireAuth();
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const opsBlocked = await ensureOpsAccess(auth);
    if (opsBlocked) return opsBlocked;

    if (!canReloadGuardiaMarcacionPin(auth.userRole)) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para recargar el PIN de marcación" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos" },
        { status: 400 }
      );
    }

    const { guardiaId } = parsed.data;

    // Verificar que el guardia existe y pertenece al tenant
    const guardia = await prisma.opsGuardia.findFirst({
      where: {
        id: guardiaId,
        tenantId: auth.tenantId,
      },
      select: {
        id: true,
        persona: {
          select: { firstName: true, lastName: true, rut: true },
        },
      },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 }
      );
    }

    // Generar PIN y hashearlo
    const plainPin = generatePin();
    const hashedPin = await bcrypt.hash(plainPin, 10);

    // Ley 21.719: solo persistimos el hash del PIN. El texto plano se
    // devuelve UNA vez en la respuesta al admin y no se almacena.
    await prisma.opsGuardia.update({
      where: { id: guardiaId },
      data: {
        marcacionPin: hashedPin,
      },
    });

    await logAudit({
      userId: auth.userId,
      userEmail: auth.userEmail,
      action: "UPDATE",
      entity: "OpsGuardia",
      entityId: guardiaId,
      details: { type: "PIN_REGENERATED" },
      tenantId: auth.tenantId,
      request: req,
    });

    // El PIN en texto plano solo se retorna UNA VEZ en esta respuesta
    return NextResponse.json({
      success: true,
      data: {
        guardiaId: guardia.id,
        guardiaName: `${guardia.persona.firstName} ${guardia.persona.lastName}`,
        rut: guardia.persona.rut,
        pin: plainPin, // Se muestra solo esta vez
        message: "PIN generado exitosamente. Este PIN solo se muestra una vez.",
      },
    });
  } catch (error) {
    console.error("[ops/marcacion/pin] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
