/**
 * Utilidades para el módulo de marcación de asistencia digital.
 * Resolución Exenta N°38 — DT Chile
 */

import { createHash, randomBytes } from "crypto";

/**
 * Genera un código de marcación único de 8 caracteres alfanuméricos (mayúsculas + dígitos).
 * Se usa como identificador en la URL pública: /marcar/[code]
 */
export function generateMarcacionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Sin I,O,0,1 para evitar confusión
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/**
 * Genera un PIN numérico de 4 dígitos.
 */
export function generatePin(): string {
  const bytes = randomBytes(2);
  const num = (bytes[0] * 256 + bytes[1]) % 10000;
  return num.toString().padStart(4, "0");
}

/**
 * Calcula el hash SHA-256 de integridad de una marcación.
 * Requisito de la Resolución Exenta N°38 para garantizar inalterabilidad.
 */
export function computeMarcacionHash(data: {
  guardiaId: string;
  installationId: string;
  tipo: string;
  timestamp: string; // ISO string
  lat: number | null;
  lng: number | null;
  metodoId: string;
  tenantId: string;
}): string {
  const payload = [
    data.guardiaId,
    data.installationId,
    data.tipo,
    data.timestamp,
    data.lat?.toString() ?? "null",
    data.lng?.toString() ?? "null",
    data.metodoId,
    data.tenantId,
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

export type MarcacionHashRecord = {
  guardiaId: string;
  installationId: string;
  tipo: string;
  timestamp: Date;
  lat: number | null;
  lng: number | null;
  metodoId: string | null;
  tenantId: string;
  hashIntegridad: string;
};

/**
 * Recalcula el hash SHA-256 con el mismo contrato que `computeMarcacionHash`
 * y lo compara con el valor persistido (Art. 8).
 */
export function verifyMarcacionHash(marcacion: MarcacionHashRecord): {
  storedHash: string;
  expectedHash: string;
  isValid: boolean;
} {
  const expectedHash = computeMarcacionHash({
    guardiaId: marcacion.guardiaId,
    installationId: marcacion.installationId,
    tipo: marcacion.tipo,
    timestamp: marcacion.timestamp.toISOString(),
    lat: marcacion.lat,
    lng: marcacion.lng,
    metodoId: marcacion.metodoId ?? "rut_pin",
    tenantId: marcacion.tenantId,
  });
  return {
    storedHash: marcacion.hashIntegridad,
    expectedHash,
    isValid: marcacion.hashIntegridad === expectedHash,
  };
}

/**
 * Calcula la distancia en metros entre dos puntos geográficos usando la fórmula de Haversine.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Radio de la Tierra en metros
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
