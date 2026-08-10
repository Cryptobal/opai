import { cache } from "react";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { getFileBuffer } from "@/lib/storage";
import { getDriveClientForTenant } from "./clients";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DEFAULT_ROOT_NAME = "Opai";
const CACHE_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export type DriveEntityRef = { type: string; id: string };

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

  const rootName = ws.rootFolderName?.trim() || DEFAULT_ROOT_NAME;

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
      await prisma.driveFolderCache.deleteMany({ where: { tenantId } });
      await prisma.googleDriveWorkspace.update({
        where: { id: ws.id },
        data: { rootFolderId: null },
      });
    }
  }

  const existing = await listRootFoldersByName(tenantId, rootName);
  if (existing.length > 0) {
    const canonical = existing[0]!.id;
    await prisma.googleDriveWorkspace.update({
      where: { id: ws.id },
      data: { rootFolderId: canonical, rootVerifiedAt: new Date() },
    });
    return canonical;
  }

  const created = await drive.files.create({
    requestBody: { name: rootName, mimeType: FOLDER_MIME },
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

export async function invalidateCacheSubtree(
  tenantId: string,
  key: string,
): Promise<void> {
  await prisma.driveFolderCache.deleteMany({
    where: {
      tenantId,
      OR: [{ pathKey: key }, { pathKey: { startsWith: `${key}/` } }],
    },
  });
}

async function verifyCachedFolder(
  tenantId: string,
  driveFolderId: string,
  key: string,
  lastVerifiedAt: Date | null,
): Promise<boolean> {
  const stale =
    !lastVerifiedAt || Date.now() - lastVerifiedAt.getTime() > CACHE_VERIFY_TTL_MS;
  if (!stale) return true;

  const drive = await getDriveClientForTenant(tenantId);
  if (!drive) return false;

  try {
    const got = await drive.files.get({
      fileId: driveFolderId,
      fields: "id,trashed",
    });
    if (!got.data.id || got.data.trashed === true) {
      await invalidateCacheSubtree(tenantId, key);
      return false;
    }
    await prisma.driveFolderCache.updateMany({
      where: { tenantId, pathKey: key },
      data: { lastVerifiedAt: new Date() },
    });
    return true;
  } catch (err) {
    if (isNotFoundError(err)) {
      await invalidateCacheSubtree(tenantId, key);
      return false;
    }
    console.warn("[drive] verifyCachedFolder:", tenantId, key, err);
    return true;
  }
}

export type EnsureFolderOpts = {
  entity?: DriveEntityRef;
  leafName?: string;
};

/** Resuelve/crea carpetas anidadas; auto-repara ante 404 de padre cacheado. */
export async function ensureFolderPath(
  tenantId: string,
  segments: string[],
  opts?: EnsureFolderOpts,
): Promise<string | null> {
  return ensureFolderPathInner(tenantId, segments, opts, false);
}

async function ensureFolderPathInner(
  tenantId: string,
  segments: string[],
  opts: EnsureFolderOpts | undefined,
  isRetry: boolean,
): Promise<string | null> {
  const rootId = await resolveRootFolder(tenantId);
  if (!rootId) return null;

  const clean = segments.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return rootId;

  let parentId = rootId;
  const accum: string[] = [];

  for (let i = 0; i < clean.length; i++) {
    const name = clean[i]!;
    const isLeaf = i === clean.length - 1;
    accum.push(name);
    const key = pathKey(accum);

    if (isLeaf && opts?.entity) {
      const byEntity = await findEntityFolder(tenantId, opts.entity);
      if (byEntity) {
        const alive = await verifyCachedFolder(
          tenantId,
          byEntity.driveFolderId,
          byEntity.pathKey,
          byEntity.lastVerifiedAt,
        );
        if (alive) {
          const desired = (opts.leafName?.trim() || name);
          if (desired !== nameFromPath(byEntity.pathKey) || byEntity.pathKey !== key) {
            await renameCachedFolder(tenantId, byEntity.id, byEntity.driveFolderId, desired, key);
          }
          return byEntity.driveFolderId;
        }
      }
    }

    const cached = await prisma.driveFolderCache.findUnique({
      where: { tenantId_pathKey: { tenantId, pathKey: key } },
    });
    if (cached) {
      const alive = await verifyCachedFolder(
        tenantId,
        cached.driveFolderId,
        key,
        cached.lastVerifiedAt,
      );
      if (alive) {
        parentId = cached.driveFolderId;
        continue;
      }
    }

    let folderName = name;
    if (isLeaf && opts?.entity) {
      folderName = await disambiguateLeafName(tenantId, accum.slice(0, -1), name, opts.entity);
    }

    let folderId: string | null = null;
    try {
      folderId = await createChildFolder(tenantId, parentId, folderName);
    } catch (err) {
      if (!isRetry && isNotFoundError(err)) {
        const parentKey = pathKey(accum.slice(0, -1));
        if (parentKey) await invalidateCacheSubtree(tenantId, parentKey);
        else await prisma.driveFolderCache.deleteMany({ where: { tenantId } });
        return ensureFolderPathInner(tenantId, segments, opts, true);
      }
      throw err;
    }
    if (!folderId) return null;

    const finalKey =
      folderName !== name ? pathKey([...accum.slice(0, -1), folderName]) : key;

    await prisma.driveFolderCache.create({
      data: {
        tenantId,
        pathKey: finalKey,
        driveFolderId: folderId,
        lastVerifiedAt: new Date(),
        entityType: isLeaf && opts?.entity ? opts.entity.type : null,
        entityId: isLeaf && opts?.entity ? opts.entity.id : null,
      },
    });
    parentId = folderId;
  }

  return parentId;
}

function nameFromPath(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1] || key;
}

async function findEntityFolder(tenantId: string, entity: DriveEntityRef) {
  return prisma.driveFolderCache.findFirst({
    where: {
      tenantId,
      entityType: entity.type,
      entityId: entity.id,
    },
    orderBy: { createdAt: "asc" },
  });
}

async function renameCachedFolder(
  tenantId: string,
  cacheRowId: string,
  folderId: string,
  newName: string,
  newPathKey: string,
): Promise<void> {
  const drive = await getDriveClientForTenant(tenantId);
  if (!drive) return;
  try {
    await drive.files.update({
      fileId: folderId,
      requestBody: { name: newName },
    });
  } catch (err) {
    console.warn("[drive] renameCachedFolder:", tenantId, folderId, err);
    return;
  }
  const collision = await prisma.driveFolderCache.findUnique({
    where: { tenantId_pathKey: { tenantId, pathKey: newPathKey } },
  });
  if (collision && collision.id !== cacheRowId) {
    await prisma.driveFolderCache.delete({ where: { id: collision.id } });
  }
  await prisma.driveFolderCache.update({
    where: { id: cacheRowId },
    data: { pathKey: newPathKey, lastVerifiedAt: new Date() },
  });
}

async function disambiguateLeafName(
  tenantId: string,
  parentSegs: string[],
  name: string,
  entity: DriveEntityRef,
): Promise<string> {
  const candidateKey = pathKey([...parentSegs, name]);
  const taken = await prisma.driveFolderCache.findUnique({
    where: { tenantId_pathKey: { tenantId, pathKey: candidateKey } },
  });
  if (!taken) return name;
  if (taken.entityType === entity.type && taken.entityId === entity.id) return name;
  return `${name} (${entity.id.slice(-6)})`;
}

export async function uploadR2ToDrive(params: {
  tenantId: string;
  r2Key: string;
  fileName: string;
  targetSegments: string[];
  mimeType?: string | null;
  entity?: DriveEntityRef;
}): Promise<string | null> {
  const drive = await getDriveClientForTenant(params.tenantId);
  if (!drive) return null;

  const leafName = params.targetSegments[params.targetSegments.length - 1];
  const parentId = await ensureFolderPath(params.tenantId, params.targetSegments, {
    entity: params.entity,
    leafName,
  });
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
