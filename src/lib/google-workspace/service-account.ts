import { google, type drive_v3 } from "googleapis";
import { driveServiceAccountEmail, driveServiceAccountKey } from "./env";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

let cached: drive_v3.Drive | null | undefined;
let missingLogged = false;

/**
 * Cliente Drive con cuenta de servicio (memoizado a nivel de módulo).
 * Degrada a null si faltan env vars — sin loguear la clave.
 */
export function getServiceAccountDriveClient(): drive_v3.Drive | null {
  if (cached !== undefined) return cached;

  const email = driveServiceAccountEmail();
  const key = driveServiceAccountKey();
  if (!email || !key) {
    if (!missingLogged) {
      missingLogged = true;
      console.warn(
        "[google-workspace] Drive SA desactivado: faltan GOOGLE_DRIVE_SA_CLIENT_EMAIL/PRIVATE_KEY",
      );
    }
    cached = null;
    return null;
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: [DRIVE_SCOPE],
  });
  cached = google.drive({ version: "v3", auth });
  return cached;
}

/** Solo tests: limpia el memo. */
export function __resetServiceAccountClientForTests() {
  cached = undefined;
  missingLogged = false;
}
