import { getServiceAccountDriveClient } from "./service-account";
import { supportsAllDrivesFlag } from "./drive-params";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export type SharedDriveCheck = {
  key: "membership" | "write" | "changes";
  ok: boolean;
  message: string;
};

export type SharedDriveDiagnosis = {
  ok: boolean;
  driveName: string | null;
  startPageToken: string | null;
  checks: SharedDriveCheck[];
};

/**
 * Diagnóstico pre-activación contra un sharedDriveId (solo en activación).
 * No persiste nada. Mensajes accionables por chequeo.
 */
export async function diagnoseSharedDrive(
  sharedDriveId: string,
): Promise<SharedDriveDiagnosis> {
  const drive = getServiceAccountDriveClient();
  const checks: SharedDriveCheck[] = [];
  let driveName: string | null = null;
  let startPageToken: string | null = null;

  if (!drive) {
    return {
      ok: false,
      driveName: null,
      startPageToken: null,
      checks: [
        {
          key: "membership",
          ok: false,
          message:
            "Cuenta de servicio no configurada (GOOGLE_DRIVE_SA_CLIENT_EMAIL / PRIVATE_KEY)",
        },
      ],
    };
  }

  try {
    const got = await drive.drives.get({
      driveId: sharedDriveId,
      fields: "id,name",
    });
    driveName = got.data.name ?? null;
    checks.push({
      key: "membership",
      ok: true,
      message: driveName
        ? `Unidad accesible: ${driveName}`
        : "Unidad accesible",
    });
  } catch {
    checks.push({
      key: "membership",
      ok: false,
      message:
        "La cuenta de servicio no es miembro de la unidad (agregala como Administrador de contenido)",
    });
    return { ok: false, driveName: null, startPageToken: null, checks };
  }

  let tempId: string | null = null;
  try {
    const created = await drive.files.create({
      requestBody: {
        name: `_opai_probe_${Date.now()}`,
        mimeType: FOLDER_MIME,
        parents: [sharedDriveId],
      },
      fields: "id",
      supportsAllDrives: true,
    });
    tempId = created.data.id ?? null;
    if (!tempId) throw new Error("sin id");
    await drive.files.delete({
      fileId: tempId,
      ...supportsAllDrivesFlag(),
    });
    checks.push({
      key: "write",
      ok: true,
      message: "Escritura OK (crear y borrar carpeta de prueba)",
    });
  } catch {
    if (tempId) {
      try {
        await drive.files.delete({ fileId: tempId, ...supportsAllDrivesFlag() });
      } catch {
        /* ignore cleanup */
      }
    }
    checks.push({
      key: "write",
      ok: false,
      message:
        "Sin permiso de escritura: el rol debe ser Administrador de contenido",
    });
  }

  try {
    const tokenRes = await drive.changes.getStartPageToken({
      driveId: sharedDriveId,
      supportsAllDrives: true,
    });
    startPageToken = tokenRes.data.startPageToken ?? null;
    checks.push({
      key: "changes",
      ok: Boolean(startPageToken),
      message: startPageToken
        ? "Lectura de cambios OK"
        : "No se obtuvo startPageToken",
    });
  } catch {
    checks.push({
      key: "changes",
      ok: false,
      message: "Sin permiso para leer cambios de la unidad",
    });
  }

  return {
    ok: checks.every((c) => c.ok),
    driveName,
    startPageToken,
    checks,
  };
}
