/**
 * GET /api/fiscalizacion/verify-hash?id=<marcacionId>
 * Verifica integridad SHA-256 de una marcación (Resolución N°38)
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function computeExpectedHash(marcacion: {
  guardiaId: string;
  tipo: string;
  timestamp: Date;
  metodoId: string | null;
  lat: number | null;
  lng: number | null;
}): string {
  const payload = [
    marcacion.guardiaId,
    marcacion.tipo,
    marcacion.timestamp.toISOString(),
    marcacion.metodoId ?? "",
    marcacion.lat?.toString() ?? "",
    marcacion.lng?.toString() ?? "",
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const allowedRoles = ["owner", "admin", "inspector_dt"];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id de marcación requerido" }, { status: 400 });
  }

  const marcacion = await prisma.opsMarcacion.findFirst({
    where: {
      id,
      guardia: { tenantId: session.user.tenantId },
    },
    include: {
      guardia: {
        include: {
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      },
    },
  });

  if (!marcacion) {
    return NextResponse.json({ error: "Marcación no encontrada" }, { status: 404 });
  }

  const expectedHash = computeExpectedHash(marcacion);
  const storedHash = marcacion.integrityHash;
  const isValid = storedHash === expectedHash;

  return NextResponse.json({
    marcacionId: marcacion.id,
    guardiaName: marcacion.guardia?.persona
      ? `${marcacion.guardia.persona.firstName} ${marcacion.guardia.persona.lastName}`
      : null,
    guardiaRut: marcacion.guardia?.persona?.rut,
    timestamp: marcacion.timestamp,
    tipo: marcacion.tipo,
    storedHash,
    expectedHash,
    isValid,
    verifiedAt: new Date().toISOString(),
  });
}
