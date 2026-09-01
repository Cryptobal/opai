import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { computeMarcacionHash } from "@/lib/marcacion";

/** Payload legacy usado por `/api/fiscalizacion/verify-hash` (no cambiar). */
export function computeLegacyFiscalizacionHash(marcacion: {
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
  return createHash("sha256").update(payload).digest("hex");
}

export async function verifyMarcacionByStoredHash(tenantId: string, hash: string) {
  const needle = hash.trim().toLowerCase();
  if (!needle || needle.length < 16) return null;

  const marcacion = await prisma.opsMarcacion.findFirst({
    where: {
      tenantId,
      hashIntegridad: { equals: needle, mode: "insensitive" },
    },
    include: {
      guardia: {
        include: { persona: { select: { firstName: true, lastName: true, rut: true } } },
      },
      installation: { select: { name: true } },
    },
  });
  if (!marcacion) return null;

  const expectedHash = computeMarcacionHash({
    guardiaId: marcacion.guardiaId,
    installationId: marcacion.installationId,
    tipo: marcacion.tipo,
    timestamp: marcacion.timestamp.toISOString(),
    lat: marcacion.lat,
    lng: marcacion.lng,
    metodoId: marcacion.metodoId ?? "",
    tenantId,
  });

  return {
    marcacionId: marcacion.id,
    guardiaName: marcacion.guardia?.persona
      ? `${marcacion.guardia.persona.firstName} ${marcacion.guardia.persona.lastName}`
      : null,
    guardiaRut: marcacion.guardia?.persona?.rut ?? null,
    timestamp: marcacion.timestamp.toISOString(),
    tipo: marcacion.tipo,
    instalacion: marcacion.installation.name,
    storedHash: marcacion.hashIntegridad,
    expectedHash,
    isValid: (marcacion.hashIntegridad || "").toLowerCase() === expectedHash.toLowerCase(),
    isModified: marcacion.isModified,
    deletedAt: marcacion.deletedAt?.toISOString() ?? null,
    verifiedAt: new Date().toISOString(),
  };
}
