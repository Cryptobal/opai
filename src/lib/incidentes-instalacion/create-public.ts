import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { createOpsTicket } from "@/lib/tickets-create";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import {
  ALLOWED_REPORT_MIME,
  DEDUP_WINDOW_MS,
  INCIDENTE_CATEGORIES,
  MAX_PHOTO_BYTES,
  MAX_REPORT_FILES,
  MAX_VIDEO_BYTES,
  MIN_DESCRIPTION_CHARS,
  isIncidenteCategory,
  type IncidenteCategoryId,
} from "./constants";
import { checkGeofence } from "./geofence";
import { IncidenteError } from "./errors";
import { generateFollowToken, sanitizeUploadFileName } from "./tokens";
import { ensureIncidenteTicketType, resolveReportToken } from "./service";
import { notifyIncidenteNuevo } from "./notify";
import { asRecord } from "./metadata";

export type UploadedReportFile = {
  storageKey: string;
  fileName: string;
  contentType: string;
  fileSize: number;
};

export function isAllowedReportMime(mime: string): boolean {
  return (ALLOWED_REPORT_MIME as readonly string[]).includes(mime);
}

export function maxBytesForMime(mime: string): number {
  if (mime.startsWith("video/")) return MAX_VIDEO_BYTES;
  return MAX_PHOTO_BYTES;
}

export function assertReportFile(opts: {
  mimeType: string;
  fileSize?: number;
}): void {
  if (!isAllowedReportMime(opts.mimeType)) {
    throw new IncidenteError("FILE_INVALID", "Tipo de archivo no permitido.", 422);
  }
  if (opts.fileSize != null && opts.fileSize > maxBytesForMime(opts.mimeType)) {
    throw new IncidenteError(
      "FILE_INVALID",
      opts.mimeType.startsWith("video/")
        ? "El video supera el máximo de 120 MB."
        : "La foto supera el máximo de 10 MB.",
      422,
    );
  }
}

export function reportStoragePrefix(tenantId: string): string {
  return `${tenantId}/incidentes/`;
}

export function assertOwnedStorageKey(tenantId: string, storageKey: string): void {
  const prefix = reportStoragePrefix(tenantId);
  if (!storageKey.startsWith(prefix) || storageKey.includes("..")) {
    throw new IncidenteError("FILE_INVALID", "Archivo no válido para este reporte.", 422);
  }
}

function firstWords(text: string, max = 48): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max).trim()}…`;
}

function dedupHash(token: string, category: string, description: string): string {
  return createHash("sha256")
    .update(`${token}|${category}|${description.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

export async function getPublicReportContext(token: string) {
  const inst = await resolveReportToken(token);
  const cfg = await getTenantCompanyConfig(inst.tenantId);
  const tenantName = cfg.commercialName || inst.tenantName;
  const tenantLogoUrl =
    cfg.brandingLogoFull || cfg.logoUrl || cfg.brandingLogoDark || cfg.brandingLogoIcon || null;
  const tenantMonogram = tenantName.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").slice(0, 2).toUpperCase() || "OP";
  return {
    installationName: inst.name,
    address: [inst.address, inst.commune, inst.city].filter(Boolean).join(", ") || null,
    tenantName,
    tenantLogoUrl: tenantLogoUrl || null,
    tenantMonogram,
    categories: INCIDENTE_CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      description: c.description,
      emergency: Boolean(c.emergency),
    })),
  };
}

export async function createPublicReport(opts: {
  token: string;
  category: string;
  description?: string;
  lat: number | null;
  lng: number | null;
  accuracy?: number | null;
  files: UploadedReportFile[];
  reporterName?: string;
  reporterContact?: string;
  userAgent?: string;
  ip?: string;
}): Promise<{ code: string; followUrl: string; followToken: string }> {
  const inst = await resolveReportToken(opts.token);
  const lat = typeof opts.lat === "number" && Number.isFinite(opts.lat) ? opts.lat : null;
  const lng = typeof opts.lng === "number" && Number.isFinite(opts.lng) ? opts.lng : null;
  if (!isIncidenteCategory(opts.category)) {
    throw new IncidenteError("VALIDATION_ERROR", "Selecciona una categoría.", 422);
  }
  const description = (opts.description ?? "").trim();
  const files = opts.files.slice(0, MAX_REPORT_FILES);
  if (description.length < MIN_DESCRIPTION_CHARS && files.length === 0) {
    throw new IncidenteError(
      "VALIDATION_ERROR",
      "Cuéntanos qué pasó o adjunta al menos una foto.",
      422,
    );
  }

  const geo = checkGeofence(inst, lat, lng, opts.accuracy);
  if (!geo.ok) {
    if (geo.code === "GPS_REQUIRED" || geo.code === "NO_COORDS") {
      throw new IncidenteError(
        "GPS_REQUIRED",
        "Necesitamos tu ubicación para confirmar que estás en la instalación.",
        422,
      );
    }
    throw new IncidenteError(
      "OUT_OF_RANGE",
      "Debes estar en la instalación para reportar.",
      422,
      { distanceM: geo.distanceM, effectiveRadiusM: geo.effectiveRadiusM },
    );
  }

  for (const file of files) {
    assertReportFile({ mimeType: file.contentType, fileSize: file.fileSize });
    assertOwnedStorageKey(inst.tenantId, file.storageKey);
  }

  const hash = dedupHash(opts.token, opts.category, description);
  const since = new Date(Date.now() - DEDUP_WINDOW_MS);
  const recent = await prisma.opsTicket.findMany({
    where: {
      tenantId: inst.tenantId,
      installationId: inst.id,
      source: "public_qr",
      createdAt: { gte: since },
    },
    select: { metadata: true },
    take: 20,
  });
  for (const row of recent) {
    const meta = asRecord(asRecord(row.metadata).publicReport);
    if (meta.dedupHash === hash) {
      throw new IncidenteError("DUPLICATE", "Este reporte ya fue enviado.", 409);
    }
  }

  const type = await ensureIncidenteTicketType(inst.tenantId);
  const category = opts.category as IncidenteCategoryId;
  const categoryName = INCIDENTE_CATEGORIES.find((c) => c.id === category)?.label ?? category;
  const titleCore = description ? firstWords(description) : `${files.length} archivo${files.length === 1 ? "" : "s"}`;
  const title = `${categoryName}: ${titleCore}`;
  const followToken = generateFollowToken();

  const created = await createOpsTicket({
    tenantId: inst.tenantId,
    actorId: "public_qr",
    reportedBy: "public_qr",
    title,
    description: description || `${categoryName} reportado desde QR`,
    ticketTypeId: type.id,
    source: "public_qr",
    assignedTeam: type.assignedTeam,
    installationId: inst.id,
    tags: ["incidente-terreno", category],
    publicFollowToken: followToken,
    skipNotify: true,
    metadata: {
      publicReport: {
        category,
        reporterName: opts.reporterName?.trim() || undefined,
        reporterContact: opts.reporterContact?.trim() || undefined,
        gps: {
          lat: lat as number,
          lng: lng as number,
          accuracy: opts.accuracy ?? null,
          distanceM: geo.distanceM,
        },
        userAgent: opts.userAgent?.slice(0, 300),
        ip: opts.ip,
        dedupHash: hash,
      },
    },
  });
  if ("error" in created) {
    throw new IncidenteError("VALIDATION_ERROR", created.error, 500);
  }

  if (files.length > 0) {
    await prisma.opsTicketAttachment.createMany({
      data: files.map((f) => ({
        tenantId: inst.tenantId,
        ticketId: created.id,
        fileName: sanitizeUploadFileName(f.fileName),
        fileSize: f.fileSize,
        contentType: f.contentType,
        storageKey: f.storageKey,
        uploadedBy: "public_qr",
        kind: "report",
      })),
    });
  }

  notifyIncidenteNuevo({
    id: created.id,
    code: created.code,
    title: created.title,
    tenantId: inst.tenantId,
    installationId: inst.id,
    installationName: inst.name,
  }).catch((err) => console.error("[incidentes] notify nuevo:", err));

  const followUrl = `${getCanonicalSiteUrl()}/r/seguimiento/${followToken}`;
  return { code: created.code, followUrl, followToken };
}
