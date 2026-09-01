/**
 * Asegura un TipoDocumento por código (idempotente).
 * Usado por migración y escritura unificada.
 */

import type { PrismaClient } from "@prisma/client";
import { resolveLegacyType } from "@/lib/docs/legacy-type-map";

type Db = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const INVALID_RAW = new Set(["undefined", "null"]);

export async function ensureTipoForLegacyType(
  db: Db,
  tenantId: string,
  rawType: string,
  hasAnyExpiry: boolean
): Promise<{ tipoId: string; created: boolean }> {
  const trimmed = rawType?.trim() ?? "";
  if (!trimmed || INVALID_RAW.has(trimmed.toLowerCase())) {
    throw new Error("tipo de documento inválido");
  }

  const resolution = resolveLegacyType(rawType, hasAnyExpiry);
  if (!resolution) {
    throw new Error("tipo de documento inválido");
  }
  const codigo = resolution.codigo;

  const existing = await db.tipoDocumento.findUnique({
    where: { tenantId_codigo: { tenantId, codigo } },
    select: { id: true },
  });
  if (existing) return { tipoId: existing.id, created: false };

  if (resolution.kind === "mapped") {
    // Alias hacia un código del catálogo que aún no existe en este tenant:
    // crear stub mínimo sin normativa inventada.
    const created = await db.tipoDocumento.create({
      data: {
        tenantId,
        codigo,
        nombre: codigo
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        capa: "guardia",
        obligatorio: false,
        tieneVencimiento: hasAnyExpiry,
        diasAlerta: 30,
        normativa: null,
        isActive: true,
      },
      select: { id: true },
    });
    return { tipoId: created.id, created: true };
  }

  const created = await db.tipoDocumento.create({
    data: {
      tenantId,
      codigo: resolution.codigo,
      nombre: resolution.nombre,
      capa: resolution.capa,
      obligatorio: resolution.obligatorio,
      tieneVencimiento: resolution.tieneVencimiento,
      diasAlerta: resolution.diasAlerta,
      normativa: resolution.normativa,
      isActive: true,
    },
    select: { id: true },
  });
  return { tipoId: created.id, created: true };
}
