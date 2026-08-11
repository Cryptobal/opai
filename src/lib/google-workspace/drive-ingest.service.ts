import { prisma } from "@/lib/prisma";
import { getTenantModulesList } from "@/lib/tenant-modules";
import { getStartPageToken, listChanges } from "./drive-changes.service";
import { asMirrorConfig } from "./drive-ingest-helpers";
import { processDriveChange } from "./drive-ingest-process";

export { DRIVE_INGEST_MAX_BYTES } from "./drive-ingest-helpers";

export type IngestRunResult = {
  processed: number;
  ingested: number;
  ignored: number;
  errors: number;
};

/** Ingesta Changes API → R2 + Documento (solo CRM). */
export async function ingestDriveChanges(tenantId: string): Promise<IngestRunResult> {
  const result: IngestRunResult = { processed: 0, ingested: 0, ignored: 0, errors: 0 };
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE", mode: "SHARED_DRIVE" },
  });
  if (!ws?.sharedDriveId) return result;

  let pageToken = ws.changesPageToken ?? (await getStartPageToken(tenantId));
  if (!pageToken) {
    await prisma.googleDriveWorkspace.update({
      where: { id: ws.id },
      data: { lastIngestError: "No se pudo obtener startPageToken" },
    });
    return result;
  }

  let listed;
  try {
    listed = await listChanges(tenantId, pageToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isGone = msg.includes("410") || /invalid.*page.?token/i.test(msg);
    if (isGone) {
      const fresh = await getStartPageToken(tenantId);
      await prisma.googleDriveWorkspace.update({
        where: { id: ws.id },
        data: {
          changesPageToken: fresh,
          lastIngestError: "Token de cambios expirado; se reinició",
        },
      });
      return result;
    }
    await prisma.googleDriveWorkspace.update({
      where: { id: ws.id },
      data: { lastIngestError: msg.slice(0, 500) },
    });
    return result;
  }

  const enabled = new Set(await getTenantModulesList(tenantId));
  const mirror = asMirrorConfig(ws.mirrorConfig);

  for (const ch of listed.changes) {
    result.processed += 1;
    const outcome = await processDriveChange(tenantId, ch, mirror, enabled);
    if (outcome === "ingested") result.ingested += 1;
    else if (outcome === "ignored") result.ignored += 1;
    else if (outcome === "error") result.errors += 1;
  }

  const nextToken = listed.exhausted
    ? listed.newStartPageToken
    : listed.resumeToken;
  await prisma.googleDriveWorkspace.update({
    where: { id: ws.id },
    data: {
      ...(nextToken ? { changesPageToken: nextToken } : {}),
      lastIngestAt: new Date(),
      lastIngestError: null,
    },
  });

  return result;
}

export async function ingestDealFolderFromDrive(
  tenantId: string,
  _dealId: string,
): Promise<IngestRunResult> {
  return ingestDriveChanges(tenantId);
}

/** Cron: tenants SHARED_DRIVE por lastIngestAt ascendente. */
export async function ingestAllSharedDriveTenants(
  limit = 10,
): Promise<{ tenants: number; results: IngestRunResult[] }> {
  const workspaces = await prisma.googleDriveWorkspace.findMany({
    where: { status: "ACTIVE", mode: "SHARED_DRIVE", sharedDriveId: { not: null } },
    orderBy: [{ lastIngestAt: "asc" }],
    take: limit,
    select: { tenantId: true },
  });
  const results: IngestRunResult[] = [];
  for (const ws of workspaces) {
    results.push(await ingestDriveChanges(ws.tenantId));
  }
  return { tenants: workspaces.length, results };
}
