import { getDriveClientForTenant } from "./clients";
import { sharedDriveParams } from "./drive-params";

export type DriveChangeItem = {
  fileId: string;
  removed: boolean;
  file: {
    id: string;
    name: string;
    mimeType: string | null;
    size: number | null;
    parents: string[];
    trashed: boolean;
  } | null;
};

const MAX_PAGES = 5;

export async function getStartPageToken(tenantId: string): Promise<string | null> {
  const client = await getDriveClientForTenant(tenantId);
  if (!client || client.mode !== "SHARED_DRIVE" || !client.driveId) return null;
  const res = await client.drive.changes.getStartPageToken({
    driveId: client.driveId,
    supportsAllDrives: true,
  });
  return res.data.startPageToken ?? null;
}

/**
 * Lista cambios. driveId siempre del tenant. Tope 5 páginas/corrida.
 * Si no se agota, `resumeToken` = nextPageToken (continuar en el próximo cron).
 * Si se agota, `newStartPageToken` es el cursor estable de Google.
 */
export async function listChanges(
  tenantId: string,
  pageToken: string,
): Promise<{
  changes: DriveChangeItem[];
  newStartPageToken: string | null;
  resumeToken: string | null;
  exhausted: boolean;
}> {
  const client = await getDriveClientForTenant(tenantId);
  if (!client || client.mode !== "SHARED_DRIVE" || !client.driveId) {
    return {
      changes: [],
      newStartPageToken: null,
      resumeToken: null,
      exhausted: true,
    };
  }

  const changes: DriveChangeItem[] = [];
  let token: string | undefined = pageToken;
  let newStartPageToken: string | null = null;
  let pages = 0;

  while (token && pages < MAX_PAGES) {
    pages += 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await client.drive.changes.list({
      pageToken: token,
      pageSize: 100,
      includeRemoved: true,
      fields:
        "nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,size,parents,trashed))",
      ...sharedDriveParams(client.driveId),
    });

    for (const ch of res.data.changes ?? []) {
      if (!ch.fileId) continue;
      const f = ch.file;
      changes.push({
        fileId: ch.fileId,
        removed: Boolean(ch.removed),
        file: f?.id
          ? {
              id: f.id,
              name: f.name ?? "archivo",
              mimeType: f.mimeType ?? null,
              size: f.size != null ? Number(f.size) : null,
              parents: f.parents ?? [],
              trashed: Boolean(f.trashed),
            }
          : null,
      });
    }

    if (res.data.newStartPageToken) {
      newStartPageToken = res.data.newStartPageToken;
    }
    token = res.data.nextPageToken ?? undefined;
  }

  const exhausted = !token;
  return {
    changes,
    newStartPageToken: exhausted ? newStartPageToken : null,
    resumeToken: exhausted ? null : (token ?? null),
    exhausted,
  };
}
