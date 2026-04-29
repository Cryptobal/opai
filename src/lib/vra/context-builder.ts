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
  reportId?: string | null,
): Promise<VraFindingContext[]> {
  // 1) Findings cargados/importados directamente al informe (vra.report_findings)
  //    Esta es la fuente PRIMARIA cuando el usuario usó el wizard de captura.
  const userFindings = reportId
    ? await prisma.vraReportFinding.findMany({
        where: { reportId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      })
    : [];

  // 2) Findings de la visita asociada (si hay) — secundarios, evitando duplicar
  //    los ya importados (que tienen importedFromFindingId).
  const importedSourceIds = new Set(
    userFindings.map((f) => f.importedFromFindingId).filter(Boolean) as string[],
  );

  const where = visitId
    ? { tenantId, visitId, status: { not: "resolved" } }
    : null;

  const visitFindings = where
    ? await prisma.opsSupervisionFinding.findMany({
        where,
        orderBy: [{ severity: "asc" }, { lastDetectedAt: "desc" }],
        take: 100,
      })
    : [];

  const fromVisit = visitFindings
    .filter((f) => !importedSourceIds.has(f.id))
    .map((f) => ({
      id: f.id,
      category: f.category ?? null,
      severity: f.severity ?? null,
      description: f.description ?? "",
      photoUrl: f.photoUrl ?? null,
      occurrenceCount: f.occurrenceCount ?? 1,
      firstDetectedAt: f.firstDetectedAt?.toISOString() ?? f.createdAt.toISOString(),
      lastDetectedAt: f.lastDetectedAt?.toISOString() ?? f.createdAt.toISOString(),
    }));

  const fromUser = userFindings.map((f) => ({
    id: f.id,
    category: f.category ?? f.sectorTag ?? null,
    severity: f.severity ?? "medium",
    description: f.aggravatingFactors
      ? `${f.description}\n\nFactores agravantes: ${f.aggravatingFactors}`
      : f.description,
    photoUrl: null as string | null,
    occurrenceCount: 1,
    firstDetectedAt: f.createdAt.toISOString(),
    lastDetectedAt: f.updatedAt.toISOString(),
    // Campos extra propagados como parte de description+category, ya que el
    // contrato VraFindingContext es estable. La IA los infiere del texto.
  }));

  // Bonus: enriquecer la description de userFindings con location y sectorTag
  const fromUserEnriched = userFindings.map((f, idx) => {
    const tags: string[] = [];
    if (f.location) tags.push(`Localización: ${f.location}`);
    if (f.sectorTag) tags.push(`Sector: ${f.sectorTag}`);
    if (f.category) tags.push(`Categoría: ${f.category}`);
    const tagPrefix = tags.length > 0 ? `[${tags.join(" · ")}]\n` : "";
    return {
      ...fromUser[idx],
      description: tagPrefix + fromUser[idx].description,
      category: f.category ?? f.sectorTag ?? null,
    };
  });

  // Devolver primero los del usuario (más relevantes) y luego los de visita
  return [...fromUserEnriched, ...fromVisit];
}

export async function buildPhotosContext(
  installationId: string,
  tenantId: string,
  visitId?: string | null,
  reportId?: string | null,
): Promise<VraPhotoContext[]> {
  const baseUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? "";
  const buildUrl = (storageKey: string, fallback: string): string => {
    if (fallback) return fallback;
    return baseUrl ? `${baseUrl}/${storageKey}` : "";
  };

  // 1) Fotos cargadas/importadas directamente al informe — fuente PRIMARIA
  const userPhotos = reportId
    ? await prisma.vraReportPhoto.findMany({
        where: { reportId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      })
    : [];

  const importedSourceIds = new Set(
    userPhotos.map((p) => p.importedFromPhotoId).filter(Boolean) as string[],
  );

  // 2) Fotos de la visita asociada (si hay) — secundarias, sin duplicar importadas
  const where = visitId ? { tenantId, visitId } : null;

  const visitPhotos = where
    ? await prisma.opsSupervisionPhoto.findMany({
        where,
        orderBy: { takenAt: "desc" },
        take: 50,
        include: { category: { select: { name: true } } },
      })
    : [];

  const fromUser = userPhotos.map((p) => ({
    id: p.id,
    storageKey: p.storageKey,
    publicUrl: buildUrl(p.storageKey, p.publicUrl ?? ""),
    takenAt: p.takenAt?.toISOString() ?? null,
    gpsLat: p.gpsLat ? Number(p.gpsLat) : null,
    gpsLng: p.gpsLng ? Number(p.gpsLng) : null,
    categoryName: p.caption ?? null,
  }));

  const fromVisit = visitPhotos
    .filter((p) => !importedSourceIds.has(p.id))
    .map((p) => ({
      id: p.id,
      storageKey: p.storageKey,
      publicUrl: buildUrl(p.storageKey, p.photoUrl ?? ""),
      takenAt: p.takenAt?.toISOString() ?? null,
      gpsLat: p.gpsLat ? Number(p.gpsLat) : null,
      gpsLng: p.gpsLng ? Number(p.gpsLng) : null,
      categoryName: p.category?.name ?? p.categoryName ?? null,
    }));

  return [...fromUser, ...fromVisit];
}
