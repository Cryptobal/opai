import { buildEmailUrl } from "@/lib/emails/site-url";

/** Rutas de configuración (el usuario ve el botón Conectar tras login). */
export const GOOGLE_WORKSPACE_CONNECT_PATHS = {
  gmail: "/opai/configuracion/integraciones/gmail",
  drive: "/opai/configuracion/integraciones/google-drive",
  calendar: "/opai/configuracion/integraciones/google-calendar",
} as const;

export type GoogleWorkspaceInviteLinks = {
  gmailUrl: string;
  driveUrl: string;
  calendarUrl: string;
};

/** Links absolutos correctos para conectar Gmail, Drive y Calendar. */
export function buildGoogleWorkspaceInviteLinks(
  tenantSlug?: string | null,
): GoogleWorkspaceInviteLinks {
  return {
    gmailUrl: buildEmailUrl(GOOGLE_WORKSPACE_CONNECT_PATHS.gmail, tenantSlug),
    driveUrl: buildEmailUrl(GOOGLE_WORKSPACE_CONNECT_PATHS.drive, tenantSlug),
    calendarUrl: buildEmailUrl(
      GOOGLE_WORKSPACE_CONNECT_PATHS.calendar,
      tenantSlug,
    ),
  };
}
