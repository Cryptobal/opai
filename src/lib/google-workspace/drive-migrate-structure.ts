import { prisma } from "@/lib/prisma";
import { DEFAULT_ROOT_NAME, ensureFolderPath, resolveRootFolder } from "./drive.service";
import {
  consolidateDuplicateRoots,
  FOLDER_MIME,
  listDriveChildren,
  listDuplicateRoots,
  MAX_MOVES,
  moveDriveFolder,
  renameDriveFolder,
} from "./drive-migrate-roots";
import {
  rewriteFolderCachePaths,
  rewritePendingOutboxPaths,
} from "./drive-migrate-rewrite";
import { emptyMigrateResult, type MigrateResult } from "./drive-migrate-types";

export type { MigrateResult };
export { listDuplicateRoots };

const LOCK_DOC = "estructura";

async function acquireLock(tenantId: string): Promise<string | null> {
  const existing = await prisma.driveExportOutbox.findFirst({
    where: { tenantId, docType: LOCK_DOC, status: "PENDING" },
  });
  if (existing) return null;
  const row = await prisma.driveExportOutbox.create({
    data: {
      tenantId,
      docType: LOCK_DOC,
      sourceType: "migrate",
      sourceId: `migrate:${Date.now()}`,
      fileName: "Migración de estructura en curso",
      targetPath: "lock",
      status: "PENDING",
    },
  });
  return row.id;
}

async function releaseLock(lockId: string, summary: string) {
  await prisma.driveExportOutbox.update({
    where: { id: lockId },
    data: {
      status: "SENT",
      sentAt: new Date(),
      fileName: "Migración / reparación de estructura",
      targetPath: summary.slice(0, 500),
    },
  });
}

/**
 * Migración v1→v2 + consolidación opcional de raíces.
 * Idempotente. HARD STOP en prod: no ejecutar sin confirmación humana.
 */
export async function migrateDriveStructure(
  tenantId: string,
  opts: { consolidateRoots: boolean },
): Promise<MigrateResult> {
  const result = emptyMigrateResult();
  const lockId = await acquireLock(tenantId);
  if (!lockId) {
    throw new Error("Ya hay una reparación/migración en curso para este tenant");
  }

  try {
    const ws = await prisma.googleDriveWorkspace.findFirst({
      where: { tenantId, status: "ACTIVE" },
    });
    if (!ws) throw new Error("Drive no conectado");

    const rootName = ws.rootFolderName?.trim() || DEFAULT_ROOT_NAME;
    const rootId = await resolveRootFolder(tenantId);
    if (!rootId) throw new Error("No se pudo resolver la raíz");

    if (opts.consolidateRoots) {
      await consolidateDuplicateRoots(tenantId, rootName, rootId, result);
      if (result.hasMore) {
        result.structureVersion = ws.structureVersion;
        await releaseLock(lockId, JSON.stringify(result));
        return result;
      }
    }

    if (ws.structureVersion >= 2) {
      result.structureVersion = 2;
      await releaseLock(lockId, JSON.stringify(result));
      return result;
    }

    const comercialId = await ensureFolderPath(tenantId, ["Comercial"]);
    if (!comercialId) throw new Error("No se pudo crear Comercial/");

    const top = await listDriveChildren(tenantId, rootId);
    for (const name of ["Clientes", "Negocios", "Licitaciones"] as const) {
      const folder = top.find((f) => f.name === name && f.mimeType === FOLDER_MIME);
      if (!folder?.id) continue;
      if (result.foldersMoved >= MAX_MOVES) {
        result.hasMore = true;
        break;
      }
      const under = (await listDriveChildren(tenantId, comercialId)).find(
        (f) => f.id === folder.id,
      );
      if (!under) {
        await moveDriveFolder(tenantId, folder.id, rootId, comercialId);
        result.foldersMoved++;
      }
      if (name === "Clientes") {
        await renameDriveFolder(tenantId, folder.id, "Cuentas");
        result.foldersRenamed++;
        const accounts = await listDriveChildren(tenantId, folder.id);
        for (const acc of accounts) {
          if (!acc.id || acc.mimeType !== FOLDER_MIME) continue;
          const kids = await listDriveChildren(tenantId, acc.id);
          const personas = kids.find(
            (k) => k.name === "Personas" && k.mimeType === FOLDER_MIME,
          );
          if (personas?.id) {
            await renameDriveFolder(tenantId, personas.id, "Contactos");
            result.foldersRenamed++;
          }
        }
      }
    }

    result.cacheRewritten = await rewriteFolderCachePaths(tenantId);
    result.outboxRewritten = await rewritePendingOutboxPaths(tenantId);
    await prisma.googleDriveWorkspace.update({
      where: { id: ws.id },
      data: { structureVersion: 2 },
    });
    result.structureVersion = 2;
    await releaseLock(lockId, JSON.stringify(result));
    return result;
  } catch (err) {
    await prisma.driveExportOutbox.update({
      where: { id: lockId },
      data: {
        status: "ERROR",
        lastError: err instanceof Error ? err.message.slice(0, 500) : "error",
        attempts: { increment: 1 },
      },
    });
    throw err;
  }
}
