/**
 * GET /api/public/marcacion/verificar/[hash]
 * Verificación pública de integridad (Art. 8). El hash SHA-256 es la credencial.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMarcacionHash } from "@/lib/marcacion";
import { isSha256Hex } from "@/lib/marcacion-format";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { formatFechaComprobante, formatHoraComprobante, formatRutComprobante } from "@/lib/marcacion-format";
import { formatPersonName } from "@/lib/personas";

export const dynamic = "force-dynamic";

const GENERIC_404 = { success: false, error: "No encontrado" };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> },
) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`public-verificar-hash:${ip}`, {
    limit: 30,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Demasiados intentos" }, { status: 429 });
  }

  const { hash } = await params;
  const normalized = hash.trim().toLowerCase();
  if (!isSha256Hex(normalized)) {
    return NextResponse.json(GENERIC_404, { status: 404 });
  }

  const marcacion = await prisma.opsMarcacion.findFirst({
    where: { hashIntegridad: normalized },
    select: {
      id: true,
      tenantId: true,
      guardiaId: true,
      installationId: true,
      tipo: true,
      timestamp: true,
      lat: true,
      lng: true,
      metodoId: true,
      hashIntegridad: true,
      isModified: true,
      deletedAt: true,
      employerName: true,
      employerRut: true,
      installation: { select: { name: true } },
      guardia: {
        select: {
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      },
    },
  });

  if (!marcacion) {
    return NextResponse.json(GENERIC_404, { status: 404 });
  }

  const integrity = verifyMarcacionHash({
    guardiaId: marcacion.guardiaId,
    installationId: marcacion.installationId,
    tipo: marcacion.tipo,
    timestamp: marcacion.timestamp,
    lat: marcacion.lat,
    lng: marcacion.lng,
    metodoId: marcacion.metodoId,
    tenantId: marcacion.tenantId,
    hashIntegridad: marcacion.hashIntegridad,
  });

  const persona = marcacion.guardia.persona;
  return NextResponse.json({
    success: true,
    data: {
      valida: integrity.isValid && !marcacion.deletedAt,
      integridadOk: integrity.isValid,
      modificada: marcacion.isModified,
      eliminada: Boolean(marcacion.deletedAt),
      tipo: marcacion.tipo,
      fecha: formatFechaComprobante(marcacion.timestamp),
      hora: formatHoraComprobante(marcacion.timestamp),
      timestamp: marcacion.timestamp.toISOString(),
      guardiaName: formatPersonName(persona.firstName, persona.lastName),
      guardiaRut: formatRutComprobante(persona.rut ?? ""),
      employerName: marcacion.employerName,
      employerRut: marcacion.employerRut,
      installationName: marcacion.installation.name,
      hash: marcacion.hashIntegridad,
    },
  });
}
