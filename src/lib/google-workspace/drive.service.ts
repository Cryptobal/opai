import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { getFileBuffer } from "@/lib/storage";
import { getDriveClientForTenant } from "./clients";

function pathKey(segments: string[]): string {
  return segments.map((s) => s.trim()).filter(Boolean).join("/");
}

async function ensureRootFolder(tenantId: string): Promise<string | null> {
  const drive = await getDriveClientForTenant(tenantId);
  if (!drive) return null;

  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
  });
  if (!ws) return null;
  if (ws.rootFolderId) return ws.rootFolderId;

  const created = await drive.files.create({
    requestBody: {
      name: "Opai",
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  const rootFolderId = created.data.id;
  if (!rootFolderId) return null;

  await prisma.googleDriveWorkspace.update({
    where: { id: ws.id },
    data: { rootFolderId },
  });
  return rootFolderId;
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
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
  });
  return created.data.id ?? null;
}

/** Resuelve/crea carpetas anidadas bajo Opai/ usando DriveFolderCache. */
export async function ensureFolderPath(
  tenantId: string,
  segments: string[],
): Promise<string | null> {
  const rootId = await ensureRootFolder(tenantId);
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
