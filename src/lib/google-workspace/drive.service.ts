import { cache } from "react";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { getFileBuffer } from "@/lib/storage";
import { getDriveClientForTenant } from "./clients";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DEFAULT_ROOT_NAME = "Opai";

function pathKey(segments: string[]): string {
  return segments.map((s) => s.trim()).filter(Boolean).join("/");
}

function isNotFoundError(err: unknown): boolean {
  const e = err as { code?: number; status?: number; errors?: Array<{ reason?: string }> };
  if (e?.code === 404 || e?.status === 404) return true;
  return e?.errors?.some((x) => x.reason === "notFound") ?? false;
}

async function listRootFoldersByName(
  tenantId: string,
  name: string,
): Promise<Array<{ id: string; createdTime?: string | null }>> {
  const drive = await getDriveClientForTenant(tenantId);
  if (!drive) return [];
  const safeName = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name='${safeName}' and mimeType='${FOLDER_MIME}' and trashed=false and 'root' in parents`,
    fields: "files(id,createdTime)",
    orderBy: "createdTime",
    pageSize: 10,
    spaces: "drive",
  });
  return (res.data.files ?? [])
    .filter((f): f is { id: string; createdTime?: string | null } => Boolean(f.id))
    .map((f) => ({ id: f.id, createdTime: f.createdTime }));
}

/**
 * Resuelve la carpeta raíz canónica del tenant: verifica vigencia,
 * busca por nombre antes de crear, y persiste rootFolderId.
 * Memoizado por request (react.cache).
 */
export const resolveRootFolder = cache(async function resolveRootFolder(
  tenantId: string,
): Promise<string | null> {
  const drive = await getDriveClientForTenant(tenantId);
  if (!drive) return null;

  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
  });
  if (!ws) return null;

  const rootName = (ws.rootFolderName?.trim() || DEFAULT_ROOT_NAME);

  if (ws.rootFolderId) {
    try {
      const got = await drive.files.get({
        fileId: ws.rootFolderId,
        fields: "id,trashed",
      });
      if (got.data.id && got.data.trashed !== true) {
        await prisma.googleDriveWorkspace.update({
          where: { id: ws.id },
          data: { rootVerifiedAt: new Date() },
        });
        return got.data.id;
      }
    } catch (err) {
      if (!isNotFoundError(err)) {
        console.warn("[drive] resolveRootFolder get falló:", tenantId, err);
      }
      // ID inválido / papelera → buscar o crear abajo
    }
  }

  const existing = await listRootFoldersByName(tenantId, rootName);
  if (existing.length > 0) {
    // Más antigua = canónica
    const canonical = existing[0]!.id;
    await prisma.googleDriveWorkspace.update({
      where: { id: ws.id },
      data: { rootFolderId: canonical, rootVerifiedAt: new Date() },
    });
    return canonical;
  }

  const created = await drive.files.create({
    requestBody: {
      name: rootName,
      mimeType: FOLDER_MIME,
    },
    fields: "id",
  });
  const rootFolderId = created.data.id;
  if (!rootFolderId) return null;

  await prisma.googleDriveWorkspace.update({
    where: { id: ws.id },
    data: { rootFolderId, rootVerifiedAt: new Date() },
  });
  return rootFolderId;
});

/** @deprecated Usar resolveRootFolder. Alias de compatibilidad. */
export async function ensureRootFolder(tenantId: string): Promise<string | null> {
  return resolveRootFolder(tenantId);
}

async function createChildFolder(
  tenantId: string,
  parentId: string,
  name: string,
): Promise<string | null> {
  const drive = await getDriveClientForTenant(tenantId);
  if (!drive) return null;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    },
    fields: "id",
  });
  return created.data.id ?? null;
}

/** Resuelve/crea carpetas anidadas bajo la raíz usando DriveFolderCache. */
export async function ensureFolderPath(
  tenantId: string,
  segments: string[],
): Promise<string | null> {
  const rootId = await resolveRootFolder(tenantId);
  if (!rootId) return null;

  let parentId = rootId;
  const accum: string[] = [];

  for (const segment of segments) {
    const name = segment.trim();
    if (!name) continue;
    accum.push(name);
    const key = pathKey(accum);

    const cached = await prisma.driveFolderCache.findUnique({
      where: { tenantId_pathKey: { tenantId, pathKey: key } },
    });
    if (cached) {
      parentId = cached.driveFolderId;
      continue;
    }

    const folderId = await createChildFolder(tenantId, parentId, name);
    if (!folderId) return null;

    await prisma.driveFolderCache.create({
      data: { tenantId, pathKey: key, driveFolderId: folderId },
    });
    parentId = folderId;
  }

  return parentId;
}

export async function uploadR2ToDrive(params: {
  tenantId: string;
  r2Key: string;
  fileName: string;
  targetSegments: string[];
  /** Content-Type original del archivo. Default pdf (compat con filas legacy). */
  mimeType?: string | null;
}): Promise<string | null> {
  const drive = await getDriveClientForTenant(params.tenantId);
  if (!drive) return null;

  const parentId = await ensureFolderPath(params.tenantId, params.targetSegments);
  if (!parentId) return null;

  const buffer = await getFileBuffer(params.r2Key);
  const created = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [parentId],
    },
    media: {
      mimeType: params.mimeType || "application/pdf",
      body: Readable.from(buffer),
    },
    fields: "id",
  });
  return created.data.id ?? null;
}

export { isNotFoundError, listRootFoldersByName, DEFAULT_ROOT_NAME, FOLDER_MIME };
