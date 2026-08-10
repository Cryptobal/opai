import { prisma } from "@/lib/prisma";
import { DOC_TYPE_TO_MODULE, type DriveModuleKey } from "./drive-tree";
import { DEFAULT_MIRROR_CONFIG } from "./drive-mirror-config";

export const DRIVE_INGEST_MAX_BYTES = 25 * 1024 * 1024;
export const FOLDER_MIME = "application/vnd.google-apps.folder";
export const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
export const CRM_ENTITIES = new Set([
  "deal",
  "account",
  "installation",
  "contact",
  "lead",
]);

export function asMirrorConfig(raw: unknown): Record<string, boolean> {
  const base = { ...DEFAULT_MIRROR_CONFIG };
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "boolean") base[k] = v;
    }
  }
  return base;
}

export function moduleEnabled(
  module: DriveModuleKey,
  enabled: Set<string>,
): boolean {
  if (module === "comercial") return enabled.has("crm") || enabled.has("cpq");
  if (module === "personas") return enabled.has("personas");
  if (module === "operaciones") {
    return enabled.has("documentos") || enabled.has("ops_supervision");
  }
  return false;
}

export function docTypeModuleEnabled(
  docType: string | undefined,
  mirror: Record<string, boolean>,
  enabled: Set<string>,
): boolean {
  if (!docType || mirror[docType] === false) return false;
  const moduleKey = DOC_TYPE_TO_MODULE[docType];
  if (!moduleKey) return false;
  return moduleEnabled(moduleKey, enabled);
}

/** Upsert IGNORED (primera vez). No pisa INGESTED/ERROR previos. */
export async function ignoreIngestedFile(params: {
  tenantId: string;
  driveFileId: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  driveFolderId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  reason: string;
}): Promise<void> {
  await prisma.driveIngestedFile.upsert({
    where: {
      tenantId_driveFileId: {
        tenantId: params.tenantId,
        driveFileId: params.driveFileId,
      },
    },
    create: {
      tenantId: params.tenantId,
      driveFileId: params.driveFileId,
      driveFolderId: params.driveFolderId ?? null,
      fileName: params.fileName,
      mimeType: params.mimeType ?? null,
      sizeBytes: params.sizeBytes ?? null,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      status: "IGNORED",
      reason: params.reason,
      ingestedAt: new Date(),
    },
    update: {},
  });
}

export async function isKnownDriveFile(
  tenantId: string,
  driveFileId: string,
): Promise<"outbox" | "ingested" | null> {
  const [outbox, ingested] = await Promise.all([
    prisma.driveExportOutbox.findFirst({
      where: { tenantId, driveFileId },
      select: { id: true },
    }),
    prisma.driveIngestedFile.findUnique({
      where: { tenantId_driveFileId: { tenantId, driveFileId } },
      select: { id: true },
    }),
  ]);
  if (ingested) return "ingested";
  if (outbox) return "outbox";
  return null;
}
