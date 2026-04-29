/**
 * Construye el contexto de datos que la IA usará para generar el informe.
 * Centraliza queries de instalación, findings, photos.
 */

import { prisma } from "@/lib/prisma";
import type {
  VraFindingContext,
  VraInstallationContext,
  VraPhotoContext,
} from "./types";

export async function buildInstallationContext(
  installationId: string,
  tenantId: string,
): Promise<VraInstallationContext | null> {
  const inst = await prisma.crmInstallation.findFirst({
    where: { id: installationId, tenantId },
    include: {
      account: { select: { name: true } },
      opsAsignacionGuardias: {
        where: { isActive: true },
        select: { id: true },
      },
    },
  });
  if (!inst) return null;

  // Extraer turnos del metadata.dotacionActiva si existe
  const turnos: { turno: string; cantidad: number }[] = [];
  const meta = (inst.metadata ?? null) as Record<string, unknown> | null;
  if (meta && typeof meta === "object" && "dotacionActiva" in meta) {
    const da = meta.dotacionActiva as Record<string, unknown>;
    if (Array.isArray(da.items)) {
      for (const item of da.items) {
        if (item && typeof item === "object" && "turno" in item && "cantidad" in item) {
          const t = item as { turno: unknown; cantidad: unknown };
          if (typeof t.turno === "string" && typeof t.cantidad === "number") {
            turnos.push({ turno: t.turno, cantidad: t.cantidad });
          }
        }
      }
    }
  }

  return {
    id: inst.id,
    name: inst.name,
    address: inst.address ?? null,
    city: inst.city ?? null,
    commune: inst.commune ?? null,
    lat: inst.lat ?? null,
    lng: inst.lng ?? null,
    notes: inst.notes ?? null,
    metadata: meta,
    clientName: inst.account?.name ?? null,
    guardiasActivos: inst.opsAsignacionGuardias.length,
    turnos,
  };
}

export async function buildFindingsContext(
  installationId: string,
  tenantId: string,
  visitId?: string | null,
): Promise<VraFindingContext[]> {
  // Si hay visitId, traer findings de esa visita; si no, los findings activos de la instalación.
  const where = visitId
    ? { tenantId, visitId, status: { not: "resolved" } }
    : { tenantId, installationId, status: { not: "resolved" } };

  const findings = await prisma.opsSupervisionFinding.findMany({
    where,
    orderBy: [{ severity: "asc" }, { lastDetectedAt: "desc" }],
    take: 100,
  });

  return findings.map((f) => ({
    id: f.id,
    category: f.category ?? null,
    severity: f.severity ?? null,
    description: f.description ?? "",
    photoUrl: f.photoUrl ?? null,
    occurrenceCount: f.occurrenceCount ?? 1,
    firstDetectedAt: f.firstDetectedAt?.toISOString() ?? f.createdAt.toISOString(),
    lastDetectedAt: f.lastDetectedAt?.toISOString() ?? f.createdAt.toISOString(),
  }));
}

export async function buildPhotosContext(
  installationId: string,
  tenantId: string,
  visitId?: string | null,
): Promise<VraPhotoContext[]> {
  // Las fotos están vinculadas a visitas. Si hay visitId usamos ese filtro directo.
  // Si no, traemos las fotos de las últimas visitas de la instalación (max 50).
  const where = visitId
    ? { tenantId, visitId }
    : { tenantId, visit: { installationId } };

  const photos = await prisma.opsSupervisionPhoto.findMany({
    where,
    orderBy: { takenAt: "desc" },
    take: 50,
    include: { category: { select: { name: true } } },
  });

  // Construir URL pública: usa la photoUrl si existe; fallback a getFileUrl si la BD aún no tenía URL
  const baseUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? "";
  const buildUrl = (storageKey: string, fallback: string): string => {
    if (fallback) return fallback;
    return baseUrl ? `${baseUrl}/${storageKey}` : "";
  };

  return photos.map((p) => ({
    id: p.id,
    storageKey: p.storageKey,
    publicUrl: buildUrl(p.storageKey, p.photoUrl ?? ""),
    takenAt: p.takenAt?.toISOString() ?? null,
    gpsLat: p.gpsLat ? Number(p.gpsLat) : null,
    gpsLng: p.gpsLng ? Number(p.gpsLng) : null,
    categoryName: p.category?.name ?? p.categoryName ?? null,
  }));
}
