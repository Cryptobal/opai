import { getDriveClientForTenant } from "./clients";
import { sharedDriveParams, supportsAllDrivesFlag } from "./drive-params";

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
};

const GOOGLE_APPS_PREFIX = "application/vnd.google-apps.";
const NON_DOWNLOADABLE = new Set([
  "application/vnd.google-apps.folder",
  "application/vnd.google-apps.shortcut",
]);

/** Lista archivos (no trasheados) de una carpeta Drive con campos livianos. */
export async function listDriveFolderFiles(
  tenantId: string,
  folderId: string,
): Promise<DriveFileMeta[]> {
  const client = await getDriveClientForTenant(tenantId);
  if (!client) return [];
  const { drive, driveId } = client;
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size,modifiedTime)",
    pageSize: 100,
    ...sharedDriveParams(driveId),
  });
  return (res.data.files ?? []).flatMap((f) =>
    f.id && f.name
      ? [
          {
            id: f.id,
            name: f.name,
            mimeType: f.mimeType ?? "application/octet-stream",
            size: f.size != null ? Number(f.size) : null,
            modifiedTime: f.modifiedTime ?? null,
          },
        ]
      : [],
  );
}

/**
 * Descarga un archivo de Drive. Docs nativos de Google se exportan a PDF
 * (nombre + `.pdf`); carpetas/shortcuts se saltan (null).
 */
export async function downloadDriveFile(
  tenantId: string,
  file: { id: string; name: string; mimeType: string },
): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
  const client = await getDriveClientForTenant(tenantId);
  if (!client) return null;
  const { drive } = client;
  if (NON_DOWNLOADABLE.has(file.mimeType)) return null;

  if (file.mimeType.startsWith(GOOGLE_APPS_PREFIX)) {
    const res = await drive.files.export(
      { fileId: file.id, mimeType: "application/pdf" },
      { responseType: "arraybuffer" },
    );
    const fileName = file.name.toLowerCase().endsWith(".pdf") ? file.name : `${file.name}.pdf`;
    return { buffer: Buffer.from(res.data as ArrayBuffer), fileName, mimeType: "application/pdf" };
  }

  const res = await drive.files.get(
    { fileId: file.id, alt: "media", ...supportsAllDrivesFlag() },
    { responseType: "arraybuffer" },
  );
  return { buffer: Buffer.from(res.data as ArrayBuffer), fileName: file.name, mimeType: file.mimeType };
}
