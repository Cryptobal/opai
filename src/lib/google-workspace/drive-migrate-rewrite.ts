import { prisma } from "@/lib/prisma";
import { mapPathKeyV1toV2, mapTargetPathV1toV2 } from "./drive-path-map";

export async function rewriteFolderCachePaths(tenantId: string): Promise<number> {
  const rows = await prisma.driveFolderCache.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  let rewritten = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const next = mapPathKeyV1toV2(row.pathKey);
      if (next === row.pathKey) continue;
      const collision = await tx.driveFolderCache.findUnique({
        where: { tenantId_pathKey: { tenantId, pathKey: next } },
      });
      if (collision) {
        if (collision.id !== row.id) {
          await tx.driveFolderCache.delete({ where: { id: row.id } });
          rewritten++;
        }
        continue;
      }
      await tx.driveFolderCache.update({
        where: { id: row.id },
        data: { pathKey: next },
      });
      rewritten++;
    }
  });
  return rewritten;
}

export async function rewritePendingOutboxPaths(tenantId: string): Promise<number> {
  const rows = await prisma.driveExportOutbox.findMany({
    where: { tenantId, status: { in: ["PENDING", "ERROR"] } },
    select: { id: true, targetPath: true },
  });
  let n = 0;
  for (const row of rows) {
    const next = mapTargetPathV1toV2(row.targetPath);
    if (next === row.targetPath) continue;
    await prisma.driveExportOutbox.update({
      where: { id: row.id },
      data: { targetPath: next },
    });
    n++;
  }
  return n;
}
