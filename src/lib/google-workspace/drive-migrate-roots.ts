import { getDriveClientForTenant } from "./clients";
import {
  DEFAULT_ROOT_NAME,
  FOLDER_MIME,
  listRootFoldersByName,
} from "./drive.service";
import { prisma } from "@/lib/prisma";
import type { MigrateResult } from "./drive-migrate-types";

const MAX_MOVES = 200;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function withDriveBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let delay = 500;
  for (let i = 0; i < 5; i++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { code?: number; status?: number; errors?: Array<{ reason?: string }> };
      const rate =
        e?.code === 403 ||
        e?.status === 429 ||
        e?.errors?.some(
          (x) => x.reason === "rateLimitExceeded" || x.reason === "userRateLimitExceeded",
        );
      if (!rate || i === 4) throw err;
      await sleep(delay);
      delay *= 2;
    }
  }
  throw new Error("backoff exhausted");
}

export async function listDriveChildren(tenantId: string, parentId: string) {
  const drive = await getDriveClientForTenant(tenantId);
  if (!drive) return [];
  const res = await withDriveBackoff(() =>
    drive.files.list({
      q: `'${parentId}' in parents and trashed=false`,
      fields: "files(id,name,mimeType)",
      pageSize: 100,
      spaces: "drive",
    }),
  );
  return res.data.files ?? [];
}

export async function moveDriveFolder(
  tenantId: string,
  fileId: string,
  fromParent: string,
  toParent: string,
) {
  const drive = await getDriveClientForTenant(tenantId);
  if (!drive) throw new Error("Sin cliente Drive");
  await withDriveBackoff(() =>
    drive.files.update({
      fileId,
      addParents: toParent,
      removeParents: fromParent,
      fields: "id,parents",
    }),
  );
}

export async function renameDriveFolder(tenantId: string, fileId: string, name: string) {
  const drive = await getDriveClientForTenant(tenantId);
  if (!drive) throw new Error("Sin cliente Drive");
  await withDriveBackoff(() =>
    drive.files.update({ fileId, requestBody: { name }, fields: "id,name" }),
  );
}

export async function consolidateDuplicateRoots(
  tenantId: string,
  rootName: string,
  canonicalId: string,
  result: MigrateResult,
): Promise<void> {
  const drive = await getDriveClientForTenant(tenantId);
  if (!drive) return;
  const roots = await listRootFoldersByName(tenantId, rootName);
  for (const r of roots) {
    if (r.id === canonicalId) continue;
    const children = await listDriveChildren(tenantId, r.id);
    for (const child of children) {
      if (!child.id) continue;
      if (result.foldersMoved >= MAX_MOVES) {
        result.hasMore = true;
        return;
      }
      await moveDriveFolder(tenantId, child.id, r.id, canonicalId);
      result.foldersMoved++;
      result.rootsMerged++;
    }
    const remaining = await listDriveChildren(tenantId, r.id);
    if (remaining.length === 0) {
      await withDriveBackoff(() =>
        drive.files.update({ fileId: r.id, requestBody: { trashed: true } }),
      );
      result.rootsTrashed++;
    } else {
      result.rootsSkipped.push({
        id: r.id,
        reason: "quedaron hijos no visibles bajo drive.file",
      });
    }
  }
}

export async function listDuplicateRoots(tenantId: string): Promise<{
  rootFolderId: string | null;
  rootFolderName: string;
  duplicates: Array<{ id: string; createdTime?: string | null }>;
}> {
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
    select: { rootFolderId: true, rootFolderName: true },
  });
  const rootFolderName = ws?.rootFolderName?.trim() || DEFAULT_ROOT_NAME;
  const all = await listRootFoldersByName(tenantId, rootFolderName);
  const canonical = ws?.rootFolderId;
  return {
    rootFolderId: canonical ?? all[0]?.id ?? null,
    rootFolderName,
    duplicates: all.filter((r) => r.id !== canonical),
  };
}

export { FOLDER_MIME, MAX_MOVES };
