/**
 * POST /api/admin/dt/crear-acceso-inspector
 * Genera credenciales temporales para un inspector de la DT (Resolución N°38)
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as bcrypt from "bcryptjs";
import crypto from "crypto";

function generateTempPassword(): string {
  return crypto.randomBytes(12).toString("base64url");
}

function generateTempUsername(inspectorName: string): string {
  const slug = inspectorName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `dt_${slug}_${suffix}`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!["owner", "admin"].includes(session.user.role)) {
    return NextResponse.json(
      { error: "Solo administradores pueden generar accesos DT" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { inspectorName, inspectorEmail, inspectorRut, validDays } = body as {
    inspectorName: string;
    inspectorEmail: string;
    inspectorRut?: string;
    validDays?: number;
  };

  if (!inspectorName?.trim() || !inspectorEmail?.trim()) {
    return NextResponse.json(
      { error: "Nombre y email del inspector son requeridos" },
      { status: 400 }
    );
  }

  if (!inspectorEmail.endsWith("@dt.gob.cl")) {
    return NextResponse.json(
      { error: "El email debe ser institucional (@dt.gob.cl)" },
      { status: 400 }
    );
  }

  const days = Math.max(10, validDays ?? 10);
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + days);

  const tempUsername = generateTempUsername(inspectorName);
  const tempPassword = generateTempPassword();
  const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

  const dtSession = await prisma.dtInspectorSession.create({
    data: {
      tenantId: session.user.tenantId,
      inspectorName: inspectorName.trim(),
      inspectorEmail: inspectorEmail.trim().toLowerCase(),
      inspectorRut: inspectorRut?.trim() || null,
      tempUsername,
      tempPasswordHash,
      validUntil,
      createdBy: session.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      userEmail: session.user.email,
      action: "dt_inspector_session_created",
      entity: "DtInspectorSession",
      entityId: dtSession.id,
      details: {
        inspectorName: inspectorName.trim(),
        inspectorEmail: inspectorEmail.trim().toLowerCase(),
        validUntil: validUntil.toISOString(),
      },
      tenantId: session.user.tenantId,
    },
  });

  // TODO: Integrar envío de email con credenciales al inspector
  // Por ahora se retornan en la respuesta para que el admin las entregue

  return NextResponse.json({
    success: true,
    sessionId: dtSession.id,
    username: tempUsername,
    password: tempPassword,
    validUntil: validUntil.toISOString(),
    inspectorEmail: inspectorEmail.trim().toLowerCase(),
    message: `Credenciales generadas. Válidas hasta ${validUntil.toLocaleDateString("es-CL")}. Envíe las credenciales a ${inspectorEmail}.`,
  });
}
